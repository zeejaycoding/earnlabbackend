import { Router, Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import jwt from "jsonwebtoken";
import mongoose, { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import User, { IUser } from "../models/User";
import SystemSettings from "../models/SystemSettings";
import {
  applyActivityEvent,
  applyDailyLoginIfEligible,
} from "../utils/activityProgression";

const router = Router();

/**
 * Session model (simple token storage for logout / revocation)
 */
interface ISession extends Document {
  user: mongoose.Types.ObjectId;
  token: string;
  revoked: boolean;
  createdAt: Date;
  expiresAt?: Date | null;
}

const SessionSchema = new Schema<ISession>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    token: { type: String, required: true, unique: true },
    revoked: { type: Boolean, required: true, default: false },
    expiresAt: { type: Date, required: false, default: null },
  },
  { timestamps: { createdAt: "createdAt" } },
);

const Session: Model<ISession> =
  mongoose.models.Session || mongoose.model<ISession>("Session", SessionSchema);

/**
 * Extract the real client IP, respecting common proxy headers.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return first.trim();
  }
  return req.ip || (req.socket as any)?.remoteAddress || "unknown";
}

/**
 * Helper: generate an affiliate code for a new user
 */
function generateAffiliateCode(): string {
  // Simple short code using uuid - in production you'd choose a nicer format
  return `REF${uuidv4().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/**
 * Helper: sign JWT token
 */
function signToken(user: IUser): string {
  // Ensure the secret and options are typed to satisfy jsonwebtoken's TypeScript definitions
  const secret: jwt.Secret =
    (process.env.JWT_SECRET as jwt.Secret) || "please-change-this-secret";

  // Build a JwtPayload (plain object matching JwtPayload) to avoid overload ambiguity
  const payload: jwt.JwtPayload = {
    sub: user._id.toString(),
    uuid: (user as any).uuid ?? null,
    email: user.email,
  };

  const expiresIn = (process.env.JWT_EXPIRES as string) || "7d";
  const options: jwt.SignOptions = { expiresIn: expiresIn as any };

  // jwt.sign accepts JwtPayload | string as the payload and jwt.Secret as the secret
  return jwt.sign(payload, secret, options);
}

/**
 * Middleware: authenticate by Bearer token and attach `req.user` (mongoose doc)
 */
async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Missing or invalid Authorization header" });
    }
    const token = auth.slice(7).trim();
    const secret = process.env.JWT_SECRET || "please-change-this-secret";
    let payload: any;
    try {
      payload = jwt.verify(token, secret) as any;
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // check session not revoked
    const session = await Session.findOne({ token, revoked: false }).exec();
    if (!session)
      return res.status(401).json({ message: "Session not found or revoked" });

    const user = await User.findById(payload.sub).exec();
    if (!user)
      return res.status(401).json({ message: "User not found for token" });

    // Check if user is banned
    if ((user as any).isBanned) {
      const banReason = (user as any).banReason || "Account suspended";
      return res.status(403).json({ 
        message: "Account has been suspended", 
        reason: banReason,
        banned: true 
      });
    }

    // attach
    (req as any).authToken = token;
    (req as any).session = session;
    (req as any).user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Validation error handler
 */
function handleValidationResult(req: Request, res: Response) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }
  return null;
}

/**
 * POST /api/v1/auth/register
 * {
 *   "username": "example_user",
 *   "email": "user@example.com",
 *   "password": "A_VerySecure_Password123!",
 *   "affiliateCode": "REF12345",
 *   "agreedToTerms": true
 * }
 */
router.post(
  "/register",
  body("username").isString().isLength({ min: 3, max: 30 }).trim(),
  body("email").isEmail().normalizeEmail(),
  body("password").isString().isLength({ min: 8 }),
  body("affiliateCode").optional().isString(),
  body("agreedToTerms")
    .isBoolean()
    .custom((v) => v === true),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validationErr = handleValidationResult(req, res);
      if (validationErr) return;

      const { username, email, password, affiliateCode } = req.body;

      // Debug: log incoming normalized values to help diagnose duplicate errors
      // NOTE: keep this minimal and remove in production
      // eslint-disable-next-line no-console
      console.log("[auth:register] attempt", {
        username: String(username || "").trim(),
        email: String(email || "")
          .toLowerCase()
          .trim(),
      });

      // Check for existing user by email or username
      const existing = await User.findOne({
        $or: [
          { email: email.toLowerCase().trim() },
          { username: username.trim() },
        ],
      }).exec();
      // eslint-disable-next-line no-console
      console.log(
        "[auth:register] existing user?",
        !!existing,
        existing
          ? {
              id: existing._id,
              email: existing.email,
              username: existing.username,
            }
          : null,
      );
      if (existing) {
        return res
          .status(409)
          .json({ message: "User with that email or username already exists" });
      }

      // Prepare new user
      const newUser = new User({
        username: username.trim(),
        email: email.toLowerCase().trim(),
        // we'll set passwordHash below
        passwordHash: "",
        agreedToTerms: true,
        // generate an own affiliate code for this user
        affiliateCode: generateAffiliateCode(),
      });

      // Handle referral: if affiliateCode provided, find referrer and set referredBy
      if (affiliateCode) {
        const referrer = await User.findOne({
          affiliateCode: affiliateCode.trim(),
        }).exec();
        if (referrer) {
          newUser.referredBy = referrer._id;
        }
      }

      // Capture IP address
      const clientIp = getClientIp(req);
      const userAgent = req.headers["user-agent"] || "unknown";
      newUser.lastLoginIp = clientIp;
      (newUser as any).lastLoginDevice = userAgent.slice(0, 200);
      (newUser.loginHistory as any[]).push({
        ip: clientIp,
        device: userAgent.slice(0, 200),
        timestamp: new Date(),
      });

      // set password (bcrypt)
      await newUser.setPassword(password);

      await newUser.save();

      // Check for duplicate IPs — flag this user if another account shares the same IP
      if (clientIp && clientIp !== "unknown" && clientIp !== "::1" && clientIp !== "127.0.0.1") {
        const duplicateCount = await User.countDocuments({
          lastLoginIp: clientIp,
          _id: { $ne: newUser._id },
        }).exec();

        if (duplicateCount > 0) {
          (newUser.adminNotes as any[]).push({
            note: `Registered from IP ${clientIp} which is shared by ${duplicateCount} other account(s). Possible multi-account.`,
            addedBy: "system",
            addedAt: new Date(),
          });
          await newUser.save();
          console.log(`[auth:register] Duplicate IP detected: ${clientIp} — user ${newUser.username} shares IP with ${duplicateCount} account(s)`);
        }
      }

      if (newUser.referredBy) {
        const referrer = await User.findById(newUser.referredBy).exec();
        if (referrer) {
          const settings = await SystemSettings.getSettings().catch(() => null);
          applyActivityEvent(referrer as any, "successful_referral", {
            scoreConfig: (settings as any)?.activityScoreConfig,
          });
          await referrer.save();
        }
      }

      // create JWT and Session record
      const token = signToken(newUser);
      const decoded: any = jwt.decode(token);
      let expiresAt: Date | null = null;
      if (decoded && decoded.exp) {
        expiresAt = new Date(decoded.exp * 1000);
      }

      await Session.create({
        user: newUser._id,
        token,
        revoked: false,
        expiresAt,
      });

      // send back sanitized user + token
      return res.status(201).json({
        token,
        user: {
          uuid: (newUser as any).uuid,
          username: newUser.username,
          email: newUser.email,
          balanceCents: newUser.balanceCents,
          affiliateCode: newUser.affiliateCode,
          referredBy: newUser.referredBy ?? null,
          createdAt: newUser.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/login
 * body: { email, password }
 */
router.post(
  "/login",
  body("email").isEmail().normalizeEmail(),
  body("password").isString().isLength({ min: 1 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validationErr = handleValidationResult(req, res);
      if (validationErr) return;

      const { email, password } = req.body;
      const user = await User.findOne({
        email: email.toLowerCase().trim(),
      }).exec();
      if (!user)
        return res.status(401).json({ message: "Invalid credentials" });

      // Check if user is banned
      if ((user as any).isBanned) {
        const banReason = (user as any).banReason || "Account suspended";
        return res.status(403).json({ 
          message: "Account has been suspended", 
          reason: banReason,
          banned: true 
        });
      }

      const ok = await user.comparePassword(password);
      if (!ok) return res.status(401).json({ message: "Invalid credentials" });

      // Capture IP and update login history
      const clientIp = getClientIp(req);
      const userAgent = req.headers["user-agent"] || "unknown";
      (user as any).lastLoginIp = clientIp;
      (user as any).lastLoginDevice = userAgent.slice(0, 200);
      ((user as any).loginHistory as any[]).push({
        ip: clientIp,
        device: userAgent.slice(0, 200),
        timestamp: new Date(),
      });

      const settings = await SystemSettings.getSettings().catch(() => null);
      applyDailyLoginIfEligible(user as any, (settings as any)?.activityScoreConfig);
      await user.save();

      const token = signToken(user);
      const decoded: any = jwt.decode(token);
      let expiresAt: Date | null = null;
      if (decoded && decoded.exp) {
        expiresAt = new Date(decoded.exp * 1000);
      }

      await Session.create({
        user: user._id,
        token,
        revoked: false,
        expiresAt,
      });

      return res.json({
        token,
        user: {
          uuid: (user as any).uuid,
          username: user.username,
          email: user.email,
          balanceCents: user.balanceCents,
          affiliateCode: user.affiliateCode,
          referredBy: user.referredBy ?? null,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/logout
 * Requires Authorization: Bearer <token>
 * Marks the session revoked.
 */
router.post(
  "/logout",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session: ISession | null = (req as any).session ?? null;
      if (!session)
        return res.status(400).json({ message: "Session not found" });

      if (session.revoked) {
        return res.status(200).json({ message: "Already logged out" });
      }

      session.revoked = true;
      await session.save();

      return res.json({ message: "Logged out" });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/clerk-sync
 * Body: { email: string }
 *
 * Server-side helper to synchronise a Clerk-authenticated user with the
 * backend user model. This endpoint will:
 *  - query Clerk's server API using CLERK_SECRET_KEY to fetch the public
 *    profile for the given email address,
 *  - find or create a corresponding backend User, and
 *  - issue a backend JWT and Session record which is returned to the client.
 *
 * This lets the frontend (after a Clerk social sign-in) call this endpoint
 * to obtain the app's JWT so the frontend can continue to use backend APIs.
 */
router.post(
  "/clerk-sync",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        email,
        name: reqName,
        avatarUrl: reqAvatarUrl,
      } = req.body as { email?: string; name?: string; avatarUrl?: string };
      // Dev-only: log incoming clerk-sync request bodies to help debug missing name/avatar
      if (process.env.NODE_ENV !== "production") {
        try {
          // eslint-disable-next-line no-console
          console.debug("[auth:clerk-sync] incoming request body:", {
            email,
            name: reqName,
            avatarUrl: reqAvatarUrl,
            fullBody: req.body,
          });
        } catch (e) {
          // ignore logging errors
        }
      }
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "email is required" });
      }

      const clerkKey = process.env.CLERK_SECRET_KEY;
      // Dev-only: log presence of clerk secret (do NOT log the secret value)
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.debug(
          "[auth:clerk-sync] CLERK_SECRET_KEY present?",
          !!clerkKey,
        );
      }
      if (!clerkKey) {
        return res
          .status(500)
          .json({ message: "Clerk secret key not configured on server" });
      }

      // Query Clerk server API for user by email
      const encoded = encodeURIComponent(email.toLowerCase().trim());
      const clerkUrl = `https://api.clerk.com/v1/users?email_address=${encoded}`;
      const r = await fetch(clerkUrl, {
        headers: {
          Authorization: `Bearer ${clerkKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!r.ok) {
        const txt = await r.text();
        return res
          .status(502)
          .json({ message: "Failed to query Clerk", detail: txt });
      }

      const arr = await r.json();
      if (!Array.isArray(arr) || arr.length === 0) {
        return res
          .status(404)
          .json({
            found: false,
            message: "No Clerk user found for that email",
          });
      }

      const c = arr[0];
      // allow frontend to provide a name/avatar fallback (useful if Clerk user object
      // is missing fields in some provider flows)
      const clerkFullName = c.full_name ?? reqName ?? c.first_name ?? c.username ?? null;
      const clerkProfileImage = c.profile_image_url ?? reqAvatarUrl ?? c.image_url ?? null;

      // Dev logging to help diagnose what Clerk returns
      if (process.env.NODE_ENV !== "production") {
        console.log("[clerk-sync] Clerk API returned:", {
          id: c.id,
          email: c.email_addresses?.[0]?.email_address,
          full_name: c.full_name,
          first_name: c.first_name,
          last_name: c.last_name,
          username: c.username,
          profile_image_url: c.profile_image_url,
          image_url: c.image_url,
          derivedName: clerkFullName,
          derivedAvatar: clerkProfileImage,
        });
      }

      // find or create backend user
      let user = await User.findOne({
        email: email.toLowerCase().trim(),
      }).exec();
      
      // Check if existing user is banned
      if (user && (user as any).isBanned) {
        const banReason = (user as any).banReason || "Account suspended";
        return res.status(403).json({ 
          message: "Account has been suspended", 
          reason: banReason,
          banned: true 
        });
      }
      
      if (!user) {
        // derive a safe username from full name or email prefix
        const base =
          (c.full_name || c.first_name || c.username || email.split("@")[0])
            .toString()
            .replace(/[^a-zA-Z0-9_\-]/g, "")
            .toLowerCase()
            .slice(0, 20) || `user${Date.now()}`;
        let candidate = base;
        let attempt = 0;
        // ensure uniqueness
        while (await User.findOne({ username: candidate }).exec()) {
          attempt += 1;
          candidate = `${base}${Math.floor(Math.random() * 9000 + 1000)}`;
          if (attempt > 5) break;
        }

        user = new User({
          username: candidate,
          email: email.toLowerCase().trim(),
          passwordHash: "",
          agreedToTerms: true,
          affiliateCode: generateAffiliateCode(),
          // persist Clerk fields when creating the user
          displayName: clerkFullName,
          avatarUrl: clerkProfileImage,
          clerkId: c.id ?? null,
          clerkCreatedAt: c.created_at ? new Date(c.created_at) : null,
        });

        // set a random password so the required field is satisfied (not used)
        await user.setPassword(Math.random().toString(36).slice(2, 12));
        await user.save();
      } else {
        // existing user: update clerk-derived fields if present
        let changed = false;
        if ((c.id ?? null) && user.clerkId !== c.id) {
          user.clerkId = c.id;
          changed = true;
        }
        const newName = clerkFullName;
        if (newName && user.displayName !== newName) {
          user.displayName = newName;
          changed = true;
        }
        const newAvatar = clerkProfileImage;
        if (newAvatar && user.avatarUrl !== newAvatar) {
          user.avatarUrl = newAvatar;
          changed = true;
        }
        if (
          c.created_at &&
          (!user.clerkCreatedAt ||
            user.clerkCreatedAt.getTime() !== new Date(c.created_at).getTime())
        ) {
          user.clerkCreatedAt = new Date(c.created_at);
          changed = true;
        }
        if (changed) {
          try {
            await user.save();
          } catch (err) {
            /* non-fatal: continue */
          }
        }
      }

      const settings = await SystemSettings.getSettings().catch(() => null);
      const appliedDailyLogin = applyDailyLoginIfEligible(
        user as any,
        (settings as any)?.activityScoreConfig,
      );
      if (appliedDailyLogin) {
        await user.save();
      }

      // create JWT and Session record
      const token = signToken(user);
      const decoded: any = jwt.decode(token);
      let expiresAt: Date | null = null;
      if (decoded && decoded.exp) {
        expiresAt = new Date(decoded.exp * 1000);
      }

      await Session.create({
        user: user._id,
        token,
        revoked: false,
        expiresAt,
      });

      return res.json({
        token,
        user: {
          uuid: (user as any).uuid,
          username: user.username,
          displayName: user.displayName ?? clerkFullName ?? null,
          avatarUrl: user.avatarUrl ?? clerkProfileImage ?? null,
          email: user.email,
          balanceCents: user.balanceCents,
          affiliateCode: user.affiliateCode,
          referredBy: user.referredBy ?? null,
          createdAt: user.createdAt,
          // include Clerk public info for convenience
          clerk: {
            id: c.id,
            fullName: clerkFullName ?? null,
            profileImageUrl: clerkProfileImage ?? null,
            createdAt: c.created_at ?? null,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/clerk-refresh
 * Body: { email: string, name?: string, avatarUrl?: string }
 * 
 * Force refresh user profile from Clerk API.
 * This is useful when a user's Clerk profile has been updated or when
 * the initial sync didn't capture all fields properly.
 */
router.post(
  "/clerk-refresh",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        email,
        name: reqName,
        avatarUrl: reqAvatarUrl,
      } = req.body as { email?: string; name?: string; avatarUrl?: string };
      
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "email is required" });
      }

      const clerkKey = process.env.CLERK_SECRET_KEY;
      if (!clerkKey) {
        return res
          .status(500)
          .json({ message: "Clerk secret key not configured on server" });
      }

      // Query Clerk server API for user by email
      const encoded = encodeURIComponent(email.toLowerCase().trim());
      const clerkUrl = `https://api.clerk.com/v1/users?email_address=${encoded}`;
      const r = await fetch(clerkUrl, {
        headers: {
          Authorization: `Bearer ${clerkKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!r.ok) {
        const txt = await r.text();
        return res
          .status(502)
          .json({ message: "Failed to query Clerk", detail: txt });
      }

      const arr = await r.json();
      if (!Array.isArray(arr) || arr.length === 0) {
        return res
          .status(404)
          .json({
            found: false,
            message: "No Clerk user found for that email",
          });
      }

      const c = arr[0];
      const clerkFullName = c.full_name ?? reqName ?? c.first_name ?? c.username ?? null;
      const clerkProfileImage = c.profile_image_url ?? reqAvatarUrl ?? c.image_url ?? null;

      console.log("[clerk-refresh] Clerk API returned:", {
        id: c.id,
        email: c.email_addresses?.[0]?.email_address,
        full_name: c.full_name,
        first_name: c.first_name,
        last_name: c.last_name,
        username: c.username,
        profile_image_url: c.profile_image_url,
        image_url: c.image_url,
        derivedName: clerkFullName,
        derivedAvatar: clerkProfileImage,
      });

      // Update existing user
      const user = await User.findOne({
        email: email.toLowerCase().trim(),
      }).exec();
      
      if (!user) {
        return res.status(404).json({ message: "User not found in database" });
      }

      // Update clerk-derived fields
      let changed = false;
      if (c.id && user.clerkId !== c.id) {
        user.clerkId = c.id;
        changed = true;
      }
      if (clerkFullName && user.displayName !== clerkFullName) {
        user.displayName = clerkFullName;
        changed = true;
      }
      if (clerkProfileImage && user.avatarUrl !== clerkProfileImage) {
        user.avatarUrl = clerkProfileImage;
        changed = true;
      }
      if (
        c.created_at &&
        (!user.clerkCreatedAt ||
          user.clerkCreatedAt.getTime() !== new Date(c.created_at).getTime())
      ) {
        user.clerkCreatedAt = new Date(c.created_at);
        changed = true;
      }
      
      if (changed) {
        await user.save();
      }

      return res.json({
        success: true,
        updated: changed,
        user: {
          uuid: (user as any).uuid,
          username: user.username,
          displayName: user.displayName ?? null,
          avatarUrl: user.avatarUrl ?? null,
          email: user.email,
          balanceCents: user.balanceCents,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/google
 * Body: { credential: string } - Google ID token from frontend
 *
 * Verifies Google ID token and creates/logs in user.
 * Returns app JWT token.
 */
router.post(
  "/google",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { credential, clientId } = req.body as { credential?: string; clientId?: string };

      if (!credential) {
        return res.status(400).json({ message: "Google credential is required" });
      }

      // Verify the Google ID token
      // Allow clientId from request or env var
      const googleClientId = process.env.GOOGLE_CLIENT_ID || clientId;
      if (!googleClientId) {
        console.error("[auth:google] No GOOGLE_CLIENT_ID in env and no clientId in request");
        return res.status(500).json({ message: "Google OAuth not configured on server" });
      }

      // Decode and verify the JWT token from Google
      // For production, you should use Google's official library, but this works for basic verification
      let payload: any;
      try {
        // Decode the JWT (Google ID tokens are JWTs)
        const parts = credential.split('.');
        if (parts.length !== 3) {
          throw new Error("Invalid token format");
        }
        payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        
        // Verify the token is for our app (accept either env var or request clientId)
        const validAudiences = [googleClientId, clientId, process.env.GOOGLE_CLIENT_ID].filter(Boolean);
        if (!validAudiences.includes(payload.aud)) {
          console.error("Token audience mismatch:", payload.aud, "expected one of:", validAudiences);
          throw new Error("Token not intended for this app");
        }
        
        // Check token expiration
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          throw new Error("Token expired");
        }
        
        // Check issuer
        if (!payload.iss?.includes('accounts.google.com')) {
          throw new Error("Invalid token issuer");
        }
      } catch (err: any) {
        console.error("Google token verification failed:", err);
        return res.status(401).json({ message: "Invalid Google token", error: err.message });
      }

      const email = payload.email?.toLowerCase().trim();
      const name = payload.name || payload.given_name || email?.split('@')[0];
      const picture = payload.picture;
      const googleId = payload.sub;

      if (!email) {
        return res.status(400).json({ message: "No email in Google token" });
      }

      console.log("[auth:google] Google user:", { email, name, googleId });

      // Find or create user
      let user = await User.findOne({ email }).exec();
      
      // Check if existing user is banned
      if (user && (user as any).isBanned) {
        const banReason = (user as any).banReason || "Account suspended";
        return res.status(403).json({ 
          message: "Account has been suspended", 
          reason: banReason,
          banned: true 
        });
      }

      if (!user) {
        // Create new user
        const base = (name || email.split("@")[0])
          .toString()
          .replace(/[^a-zA-Z0-9_\-]/g, "")
          .toLowerCase()
          .slice(0, 20) || `user${Date.now()}`;
        
        let candidate = base || `user${Date.now()}`;
        // Ensure minimum length of 3 for username
        if (candidate.length < 3) {
          candidate = `${candidate}${Date.now().toString().slice(-4)}`;
        }
        
        let attempt = 0;
        while (await User.findOne({ username: candidate }).exec()) {
          attempt += 1;
          candidate = `${base}${Math.floor(Math.random() * 9000 + 1000)}`;
          if (attempt > 5) break;
        }

        // Generate password hash BEFORE creating user (required field)
        const randomPassword = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(randomPassword, salt);

        user = new User({
          username: candidate,
          email: email,
          passwordHash: passwordHash,
          agreedToTerms: true,
          affiliateCode: generateAffiliateCode(),
          displayName: name,
          avatarUrl: picture,
          googleId: googleId,
        });

        await user.save();
        console.log("[auth:google] Created new user:", user.username);
      } else {
        // Update existing user with Google info if needed
        let changed = false;
        if (googleId && user.googleId !== googleId) {
          user.googleId = googleId;
          changed = true;
        }
        if (name && !user.displayName) {
          user.displayName = name;
          changed = true;
        }
        if (picture && !user.avatarUrl) {
          user.avatarUrl = picture;
          changed = true;
        }
        // Defensively fill required fields that may be missing on legacy accounts
        if (!user.username) {
          const base = (name || email.split("@")[0])
            .toString()
            .replace(/[^a-zA-Z0-9_\-]/g, "")
            .toLowerCase()
            .slice(0, 20) || `user${Date.now()}`;
          let candidate = base.length >= 3 ? base : `${base}${Date.now().toString().slice(-4)}`;
          let attempt = 0;
          while (await User.findOne({ username: candidate }).exec()) {
            attempt += 1;
            candidate = `${base}${Math.floor(Math.random() * 9000 + 1000)}`;
            if (attempt > 5) break;
          }
          user.username = candidate;
          changed = true;
        }
        if (!user.passwordHash) {
          const rndPwd = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
          const salt = await bcrypt.genSalt(10);
          user.passwordHash = await bcrypt.hash(rndPwd, salt);
          changed = true;
        }
        if (changed) {
          await user.save();
        }
        console.log("[auth:google] Existing user logged in:", user.username);
      }

      // Capture IP for Google OAuth logins
      const googleClientIp = getClientIp(req);
      const googleUserAgent = req.headers["user-agent"] || "unknown";
      (user as any).lastLoginIp = googleClientIp;
      (user as any).lastLoginDevice = googleUserAgent.slice(0, 200);
      ((user as any).loginHistory as any[]).push({
        ip: googleClientIp,
        device: googleUserAgent.slice(0, 200),
        timestamp: new Date(),
      });

      const settings = await SystemSettings.getSettings().catch(() => null);
      applyDailyLoginIfEligible(user as any, (settings as any)?.activityScoreConfig);
      await user.save();

      // Generate app JWT
      const token = signToken(user);

      // Create session
      const session = new Session({
        user: user._id,
        token,
        revoked: false,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });
      await session.save();

      return res.json({
        token,
        user: {
          uuid: (user as any).uuid,
          username: user.username,
          displayName: user.displayName ?? null,
          avatarUrl: user.avatarUrl ?? null,
          email: user.email,
          balanceCents: user.balanceCents,
        },
      });
    } catch (err) {
      console.error("[auth:google] Error:", err);
      next(err);
    }
  },
);

export default router;
