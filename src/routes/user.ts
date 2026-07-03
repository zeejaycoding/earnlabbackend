import { Router, Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import jwt from "jsonwebtoken";
import dayjs from "dayjs";
import mongoose from "mongoose";
import crypto from "crypto";
import User, { IUser } from "../models/User";
import PromoCode from "../models/PromoCode";
import SystemSettings from "../models/SystemSettings";
import {
  calculateActivityProgress,
  evaluateAndMergeBadges,
  getActivityBadgeViews,
  getActivityBadges,
  getActivityStats,
} from "../utils/activityProgression";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "please-change-this-secret";

// =============================================
// 2FA HELPER FUNCTIONS
// =============================================

/**
 * Generate a random base32 secret for TOTP
 */
function generateTOTPSecret(): string {
  const buffer = crypto.randomBytes(20);
  const base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let secret = "";
  for (let i = 0; i < buffer.length; i++) {
    secret += base32chars[buffer[i] % 32];
  }
  return secret;
}

/**
 * Convert base32 to buffer for HMAC
 */
function base32ToBuffer(base32: string): Buffer {
  const base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32.toUpperCase()) {
    const val = base32chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/**
 * Generate TOTP code for given secret and time
 */
function generateTOTP(secret: string, time?: number): string {
  const counter = Math.floor((time || Date.now()) / 30000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));
  
  const key = base32ToBuffer(secret);
  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1000000;
  
  return code.toString().padStart(6, "0");
}

/**
 * Verify TOTP code with time window
 */
function verifyTOTP(secret: string, code: string, window: number = 1): boolean {
  const now = Date.now();
  for (let i = -window; i <= window; i++) {
    const testTime = now + i * 30000;
    if (generateTOTP(secret, testTime) === code) {
      return true;
    }
  }
  return false;
}

/**
 * Generate backup codes
 */
function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    codes.push(code);
  }
  return codes;
}

/**
 * Simple authentication middleware that verifies the Bearer token,
 * looks up the user by the token's `sub` claim and attaches the user
 * document to `req.user`.
 *
 * Note: Session revocation (logout blacklisting) is handled elsewhere
 * (sessions collection). This middleware focuses on token verification
 * and user lookup so the routes are self-contained.
 */
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.header("authorization");
    if (!auth || !auth.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Missing or invalid Authorization header" });
    }

    const token = auth.slice(7).trim();
    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET) as any;
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const userId = payload.sub;
    if (!userId) {
      return res.status(401).json({ message: "Token missing subject claim" });
    }

    const user = await User.findById(userId).exec();
    if (!user) {
      return res.status(401).json({ message: "User not found for token" });
    }

    // Check if user is banned
    if ((user as any).isBanned) {
      const banReason = (user as any).banReason || "Account suspended";
      return res.status(403).json({ 
        message: "Account has been suspended", 
        reason: banReason,
        banned: true 
      });
    }

    // attach the mongoose user document for downstream handlers
    (req as any).user = user;
    (req as any).authToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/user/profile
 * Returns the user's public profile and simple stats.
 */
router.get(
  "/profile",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user: IUser = (req as any).user;
      const settings = await SystemSettings.getSettings().catch(() => null);

      const activityStats = getActivityStats((user as any).activityStats);
      const currentBadges = getActivityBadges((user as any).activityBadges);
      const mergedBadges = evaluateAndMergeBadges(
        activityStats,
        currentBadges,
        user.createdAt,
      );
      const badgesChanged =
        JSON.stringify(currentBadges) !== JSON.stringify(mergedBadges);
      if (badgesChanged) {
        (user as any).activityBadges = mergedBadges;
        await user.save();
      }

      const progression = calculateActivityProgress(
        Number((user as any).activityScore || 0),
        (settings as any)?.activityLevelThresholds,
      );
      const badges = getActivityBadgeViews(mergedBadges);

      const completedTotal =
        (activityStats.offersCompleted || 0) +
        (activityStats.surveysCompleted || 0);

      // Basic derived stats. In a full implementation these would be aggregated
      // from tasks, game_plays, leaderboards, etc.
      const profile = {
        _id: user._id,
        uuid: (user as any).uuid,
        username: user.username,
        displayName: user.displayName ?? null,
        avatarUrl: user.avatarUrl ?? null,
        email: user.email,
        balanceCents: user.balanceCents,
        affiliateCode: user.affiliateCode ?? null,
        referredBy: user.referredBy ?? null,
        profilePrivacy: (user as any).profilePrivacy ?? 'public',
        profileCompleted: (user as any).profileCompleted === true,
        joinedAt: user.createdAt,
        activityScore: progression.activityScore,
        activityLevel: progression.currentLevel,
      };

      const stats = {
        balanceCents: user.balanceCents,
        tasksCompleted: completedTotal,
        tasksInProgress: 0,
        lifetimeEarningsCents: user.balanceCents,
        lastActive: user.updatedAt,
        offersCompleted: activityStats.offersCompleted,
        surveysCompleted: activityStats.surveysCompleted,
        successfulReferrals: activityStats.successfulReferrals,
        dailyLogins: activityStats.dailyLogins,
      };

      return res.json({
        profile,
        stats,
        progression,
        badges,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/user/lookup
 * Public endpoint to lookup a user's public display name and avatar by email.
 * This is intended to allow client-side UIs to quickly display a friendly
 * name/avatar when the app-level session has not yet been established.
 * NOTE: Be cautious with this in production — consider rate-limiting or
 * requiring additional auth if exposing user enumeration is a concern.
 */
router.post(
  "/lookup",
  body("email").isEmail().normalizeEmail(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }

      const { email } = req.body as { email: string };
      const user = await User.findOne({
        email: email.toLowerCase().trim(),
      }).exec();
      if (!user) return res.status(404).json({ message: "User not found" });

      return res.json({
        name:
          user.displayName && user.displayName.length > 0
            ? user.displayName
            : user.username,
        avatarUrl: user.avatarUrl ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/user/stats
 * Returns live/real-time style stats for the user (lightweight).
 */
router.get(
  "/stats",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user: IUser = (req as any).user;

      // Example live stats. Replace with real aggregates as data models are added.
      const liveStats = {
        balance: {
          cents: user.balanceCents,
          formatted: `$${(user.balanceCents / 100).toFixed(2)}`,
        },
        tasks: {
          pending: 0,
          completed: 0,
        },
        games: {
          playsToday: 0,
        },
        // example time of retrieval
        retrievedAt: dayjs().toISOString(),
      };

      return res.json(liveStats);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/user/settings
 * Returns current personal information (username, email, dob, postcode).
 */
router.get(
  "/settings",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user: IUser = (req as any).user;

      return res.json({
        username: user.username,
        email: user.email,
        dob: user.dob ? dayjs(user.dob).format("YYYY-MM-DD") : null,
        postcode: user.postcode ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /api/v1/user/settings
 * Body may contain: username, email, dob (YYYY-MM-DD), postcode
 */
router.put(
  "/settings",
  requireAuth,
  body("username").optional().isString().isLength({ min: 3, max: 30 }).trim(),
  body("email").optional().isEmail().normalizeEmail(),
  body("dob").optional().isISO8601().toDate(),
  body("postcode").optional().isString().trim().isLength({ min: 2, max: 20 }),
  body("profilePrivacy").optional().isIn(['public', 'private']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }

      const user: IUser = (req as any).user;
      const { username, email, dob, postcode, profilePrivacy } = req.body as {
        username?: string;
        email?: string;
        dob?: Date;
        postcode?: string;
        profilePrivacy?: 'public' | 'private';
      };

      // If changing email or username, ensure uniqueness
      if (email && email.toLowerCase().trim() !== user.email) {
        const existingByEmail = await User.findOne({
          email: email.toLowerCase().trim(),
        }).exec();
        if (existingByEmail) {
          return res.status(409).json({ message: "Email already in use" });
        }
        user.email = email.toLowerCase().trim();
      }

      if (username && username.trim() !== user.username) {
        const existingByUsername = await User.findOne({
          username: username.trim(),
        }).exec();
        if (existingByUsername) {
          return res.status(409).json({ message: "Username already in use" });
        }
        user.username = username.trim();
      }

      if (dob) {
        user.dob = dob;
      }
      if (postcode !== undefined) {
        user.postcode = postcode || null;
      }
      if (profilePrivacy !== undefined) {
        (user as any).profilePrivacy = profilePrivacy;
      }

      await user.save();

      // Emit a socket event to the user room so their UI updates in realtime
      try {
        const io = (req.app as any).locals?.io;
        if (io && user.id) {
          const room = `user:${user.id}`;
          io.to(room).emit("profile:update", {
            type: "profile.update",
            title: "Profile updated",
            body: "Your profile settings have been updated",
            updatedFields: { username: user.username, email: user.email, dob: user.dob, postcode: user.postcode },
            updatedAt: user.updatedAt,
          });
        }
      } catch (e) {
        // ignore emitting failures
      }

      return res.json({
        username: user.username,
        email: user.email,
        dob: user.dob ? dayjs(user.dob).format("YYYY-MM-DD") : null,
        postcode: user.postcode ?? null,
        updatedAt: user.updatedAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/user/profile
 * Partial update of user profile (supports profilePrivacy and other fields)
 */
router.patch(
  "/profile",
  requireAuth,
  body("profilePrivacy").optional().isIn(['public', 'private']),
  body("displayName").optional().isString().trim(),
  body("avatarUrl").optional().isString().trim(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }

      const user: IUser = (req as any).user;
      const { profilePrivacy, displayName, avatarUrl } = req.body as {
        profilePrivacy?: 'public' | 'private';
        displayName?: string;
        avatarUrl?: string;
      };

      if (profilePrivacy !== undefined) {
        (user as any).profilePrivacy = profilePrivacy;
      }
      if (displayName !== undefined) {
        user.displayName = displayName || null;
      }
      if (avatarUrl !== undefined) {
        user.avatarUrl = avatarUrl || null;
      }

      await user.save();

      return res.json({
        message: "Profile updated",
        profilePrivacy: (user as any).profilePrivacy,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/user/tasks
 * Returns the user's tasks (progress). Currently a stub returning an empty list.
 * Replace with real task fetching once Task model is available.
 */
router.get(
  "/tasks",
  requireAuth,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // TODO: Implement Task model and query tasks for the user.
      return res.json({ tasks: [] });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/user/daily-checkin
 * Returns whether the user is eligible to claim today's daily bonus and the last claimed time.
 */
router.get(
  "/daily-checkin",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user: IUser = (req as any).user;

      const lastClaimed: Date | null = user.lastDailyCheckin
        ? new Date(user.lastDailyCheckin)
        : null;
      const today = dayjs().startOf("day");

      const eligible = !lastClaimed || dayjs(lastClaimed).isBefore(today);

      return res.json({ eligible, lastClaimedAt: lastClaimed });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/user/daily-checkin/claim
 * Claims the daily $0.10 bonus for the authenticated user.
 */
router.post(
  "/daily-checkin/claim",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user: IUser = (req as any).user;

      const lastClaimed: Date | null = user.lastDailyCheckin
        ? new Date(user.lastDailyCheckin)
        : null;
      const today = dayjs().startOf("day");

      if (lastClaimed && !dayjs(lastClaimed).isBefore(today)) {
        return res.status(400).json({ message: "Daily bonus already claimed" });
      }

      const rewardCents = 10; // $0.10

      // update wallet and streak atomically
      // simple logic: if last claimed was yesterday, increment streak; otherwise reset to 1
      const yesterday = dayjs().subtract(1, "day").startOf("day");
      if (lastClaimed && dayjs(lastClaimed).isSame(yesterday, "day")) {
        user.streakDays = (user.streakDays || 0) + 1;
      } else {
        user.streakDays = 1;
      }

      user.balanceCents = (user.balanceCents || 0) + rewardCents;
      user.lastDailyCheckin = new Date();
      await user.save();

      // Emit a socket event to the user room so their UI updates in realtime
      try {
        const io = (req.app as any).locals?.io;
        if (io && user.id) {
          const room = `user:${user.id}`;
          io.to(room).emit("notification", {
            type: "daily.checkin",
            title: "Daily bonus claimed",
            body: `You received $${(rewardCents / 100).toFixed(2)} for today's check-in`,
            rewardCents,
            newBalanceCents: user.balanceCents,
            claimedAt: user.lastDailyCheckin,
          });
        }
      } catch (e) {
        // ignore emitting failures
      }

      return res.json({
        message: "Daily bonus claimed",
        rewardCents,
        newBalanceCents: user.balanceCents,
        claimedAt: user.lastDailyCheckin,
        streakDays: user.streakDays,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/user/bonus-code/redeem
 * Redeems a promo code and credits the user's balance.
 * Body: { code: string }
 */
router.post(
  "/bonus-code/redeem",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user: IUser = (req as any).user;
      const { code } = req.body as { code?: string };
      if (!code || typeof code !== "string") {
        return res.status(400).json({ message: "Code is required" });
      }

      // Find the promo code
      const promoCode = await PromoCode.findOne({
        code: code.trim().toUpperCase(),
      }).exec();
      
      if (!promoCode) {
        return res.status(404).json({ message: "Invalid bonus code" });
      }

      // Check if code is active
      if (!promoCode.isActive) {
        return res.status(410).json({ message: "Code is no longer active" });
      }

      // Check if code is expired
      if (promoCode.expiresAt && dayjs().isAfter(dayjs(promoCode.expiresAt))) {
        return res.status(410).json({ message: "Code expired" });
      }

      // Check if code is valid (hasn't started yet)
      if (promoCode.validFrom && dayjs().isBefore(dayjs(promoCode.validFrom))) {
        return res.status(400).json({ message: "Code is not yet valid" });
      }

      // Check if usage limit reached
      if (promoCode.usedCount >= promoCode.usageLimit) {
        return res.status(410).json({ message: "Code usage limit reached" });
      }

      // Check if user already used this code (based on maxUsesPerUser)
      const userId = user._id;
      const userUsageCount = promoCode.usedBy.filter(
        (id: any) => id.toString() === userId.toString()
      ).length;
      
      if (userUsageCount >= (promoCode.maxUsesPerUser || 1)) {
        return res.status(400).json({ message: "You have already used this code" });
      }

      // Check minimum balance requirement
      if (promoCode.minBalanceRequired && user.balanceCents < promoCode.minBalanceRequired) {
        return res.status(400).json({ 
          message: `Minimum balance of $${(promoCode.minBalanceRequired / 100).toFixed(2)} required` 
        });
      }

      if (promoCode.amountCents <= 0) {
        return res.status(400).json({ message: "Invalid bonus amount" });
      }

      // Apply reward
      user.balanceCents = (user.balanceCents || 0) + promoCode.amountCents;
      await user.save();

      // Emit a socket event to the user room so their UI updates in realtime
      try {
        const io = (req.app as any).locals?.io;
        if (io && user.id) {
          const room = `user:${user.id}`;
          io.to(room).emit("notification", {
            type: "bonus.redeemed",
            title: "Bonus redeemed",
            body: `You received $${(promoCode.amountCents / 100).toFixed(2)} from bonus code`,
            rewardCents: promoCode.amountCents,
            newBalanceCents: user.balanceCents,
            redeemedAt: new Date(),
          });
        }
      } catch (e) {
        // ignore emitting failures
      }

      // Increment usedCount and add user to usedBy array atomically
      await PromoCode.updateOne(
        { _id: promoCode._id },
        { 
          $inc: { usedCount: 1 },
          $addToSet: { usedBy: userId }
        }
      ).exec();

      return res.json({
        message: "Bonus redeemed",
        rewardCents: promoCode.amountCents,
        newBalanceCents: user.balanceCents,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/user/debug/:email
 * Debug endpoint to check what's stored in the database for a user
 * Remove this in production!
 */
router.get(
  "/debug/:email",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.params;
      const user = await User.findOne({
        email: email.toLowerCase().trim(),
      }).exec();
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.json({
        _id: user._id,
        uuid: (user as any).uuid,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        email: user.email,
        clerkId: user.clerkId,
        clerkCreatedAt: user.clerkCreatedAt,
        balanceCents: user.balanceCents,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (err) {
      next(err);
    }
  },
);


/**
 * POST /api/v1/user/admin/add-balance
 * Admin endpoint to add test balance to a user account
 * IMPORTANT: This should be removed or secured in production!
 */
router.post(
  "/admin/add-balance",
  body("email").isEmail().notEmpty(),
  body("amountInDollars").isFloat({ min: 0.01 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, amountInDollars } = req.body;
      
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: "User not found" 
        });
      }

      const amountCents = Math.round(amountInDollars * 100);
      const oldBalance = user.balanceCents;
      user.balanceCents += amountCents;
      await user.save();

      return res.json({
        success: true,
        message: "Balance added successfully",
        oldBalance: oldBalance / 100,
        addedAmount: amountInDollars,
        newBalance: user.balanceCents / 100,
      });
    } catch (err) {
      next(err);
    }
  }
);

// =============================================
// TWO-FACTOR AUTHENTICATION (2FA) ROUTES
// =============================================

/**
 * GET /api/v1/user/2fa/status
 * Get current 2FA status for the user
 */
router.get(
  "/2fa/status",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user: IUser = (req as any).user;
      
      return res.json({
        enabled: !!(user as any).twoFactorEnabled,
        hasBackupCodes: !!((user as any).twoFactorBackupCodes?.length > 0),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/user/2fa/setup
 * Initialize 2FA setup - generates secret and returns QR code data
 */
router.post(
  "/2fa/setup",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user: IUser = (req as any).user;
      
      // Generate a new TOTP secret
      const secret = generateTOTPSecret();
      
      // Store temporarily (not enabled until verified)
      (user as any).twoFactorTempSecret = secret;
      await user.save();
      
      // Generate otpauth URI for QR code
      const appName = "Labwards";
      const otpauthUrl = `otpauth://totp/${encodeURIComponent(appName)}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${encodeURIComponent(appName)}`;
      
      return res.json({
        success: true,
        secret,
        otpauthUrl,
        message: "Scan the QR code with your authenticator app, then verify with a code",
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/user/2fa/verify
 * Verify the 2FA setup with a code from authenticator app
 */
router.post(
  "/2fa/verify",
  requireAuth,
  body("code").isString().isLength({ min: 6, max: 6 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const user: IUser = (req as any).user;
      const { code } = req.body;
      
      const tempSecret = (user as any).twoFactorTempSecret;
      if (!tempSecret) {
        return res.status(400).json({
          success: false,
          message: "No 2FA setup in progress. Please start setup first.",
        });
      }
      
      // Verify the code
      if (!verifyTOTP(tempSecret, code)) {
        return res.status(400).json({
          success: false,
          message: "Invalid verification code. Please try again.",
        });
      }
      
      // Generate backup codes
      const backupCodes = generateBackupCodes();
      
      // Enable 2FA
      (user as any).twoFactorSecret = tempSecret;
      (user as any).twoFactorEnabled = true;
      (user as any).twoFactorBackupCodes = backupCodes.map(code => ({
        code,
        used: false,
      }));
      (user as any).twoFactorTempSecret = undefined;
      await user.save();
      
      return res.json({
        success: true,
        message: "Two-factor authentication enabled successfully!",
        backupCodes,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/user/2fa/disable
 * Disable 2FA for the user (requires password or valid 2FA code)
 */
router.post(
  "/2fa/disable",
  requireAuth,
  body("code").isString().isLength({ min: 6, max: 8 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const user: IUser = (req as any).user;
      const { code } = req.body;
      
      if (!(user as any).twoFactorEnabled) {
        return res.status(400).json({
          success: false,
          message: "Two-factor authentication is not enabled.",
        });
      }
      
      const secret = (user as any).twoFactorSecret;
      
      // Check if it's a valid TOTP code
      let isValid = verifyTOTP(secret, code);
      
      // If not, check backup codes
      if (!isValid) {
        const backupCodes = (user as any).twoFactorBackupCodes || [];
        const backupIndex = backupCodes.findIndex(
          (bc: any) => bc.code === code.toUpperCase() && !bc.used
        );
        if (backupIndex !== -1) {
          isValid = true;
          backupCodes[backupIndex].used = true;
        }
      }
      
      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: "Invalid verification code.",
        });
      }
      
      // Disable 2FA
      (user as any).twoFactorSecret = undefined;
      (user as any).twoFactorEnabled = false;
      (user as any).twoFactorBackupCodes = [];
      await user.save();
      
      return res.json({
        success: true,
        message: "Two-factor authentication has been disabled.",
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/user/2fa/validate
 * Validate a 2FA code (used during login)
 */
router.post(
  "/2fa/validate",
  body("code").isString().isLength({ min: 6, max: 8 }),
  body("userId").isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const { code, userId } = req.body;
      
      const user = await User.findById(userId).exec();
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }
      
      if (!(user as any).twoFactorEnabled) {
        return res.status(400).json({
          success: false,
          message: "Two-factor authentication is not enabled for this account.",
        });
      }
      
      const secret = (user as any).twoFactorSecret;
      
      // Check if it's a valid TOTP code
      let isValid = verifyTOTP(secret, code);
      
      // If not, check backup codes
      if (!isValid) {
        const backupCodes = (user as any).twoFactorBackupCodes || [];
        const backupIndex = backupCodes.findIndex(
          (bc: any) => bc.code === code.toUpperCase() && !bc.used
        );
        if (backupIndex !== -1) {
          isValid = true;
          // Mark backup code as used
          backupCodes[backupIndex].used = true;
          await user.save();
        }
      }
      
      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: "Invalid verification code.",
        });
      }
      
      return res.json({
        success: true,
        message: "Two-factor authentication verified.",
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/user/2fa/regenerate-backup
 * Regenerate backup codes
 */
router.post(
  "/2fa/regenerate-backup",
  requireAuth,
  body("code").isString().isLength({ min: 6, max: 6 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const user: IUser = (req as any).user;
      const { code } = req.body;
      
      if (!(user as any).twoFactorEnabled) {
        return res.status(400).json({
          success: false,
          message: "Two-factor authentication is not enabled.",
        });
      }
      
      const secret = (user as any).twoFactorSecret;
      
      // Verify the code first
      if (!verifyTOTP(secret, code)) {
        return res.status(400).json({
          success: false,
          message: "Invalid verification code.",
        });
      }
      
      // Generate new backup codes
      const backupCodes = generateBackupCodes();
      (user as any).twoFactorBackupCodes = backupCodes.map(code => ({
        code,
        used: false,
      }));
      await user.save();
      
      return res.json({
        success: true,
        message: "New backup codes generated successfully.",
        backupCodes,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/user/change-password
 * Changes the authenticated user's password.
 * body: { currentPassword: string, newPassword: string }
 */
router.post(
  "/change-password",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user: IUser = (req as any).user;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Both currentPassword and newPassword are required" });
      }

      if (typeof newPassword !== "string" || newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }

      const isValid = await user.comparePassword(currentPassword);
      if (!isValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      await user.setPassword(newPassword);
      await user.save();

      return res.json({ success: true, message: "Password changed successfully" });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
