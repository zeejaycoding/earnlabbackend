"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dayjs_1 = __importDefault(require("dayjs"));
const crypto_1 = __importDefault(require("crypto"));
const User_1 = __importDefault(require("../models/User"));
const PromoCode_1 = __importDefault(require("../models/PromoCode"));
const SystemSettings_1 = __importDefault(require("../models/SystemSettings"));
const activityProgression_1 = require("../utils/activityProgression");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || "please-change-this-secret";
// =============================================
// 2FA HELPER FUNCTIONS
// =============================================
/**
 * Generate a random base32 secret for TOTP
 */
function generateTOTPSecret() {
    const buffer = crypto_1.default.randomBytes(20);
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
function base32ToBuffer(base32) {
    const base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (const char of base32.toUpperCase()) {
        const val = base32chars.indexOf(char);
        if (val === -1)
            continue;
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
function generateTOTP(secret, time) {
    const counter = Math.floor((time || Date.now()) / 30000);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter));
    const key = base32ToBuffer(secret);
    const hmac = crypto_1.default.createHmac("sha1", key).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = (((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff)) % 1000000;
    return code.toString().padStart(6, "0");
}
/**
 * Verify TOTP code with time window
 */
function verifyTOTP(secret, code, window = 1) {
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
function generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < 10; i++) {
        const code = crypto_1.default.randomBytes(4).toString("hex").toUpperCase();
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
async function requireAuth(req, res, next) {
    try {
        const auth = req.header("authorization");
        if (!auth || !auth.startsWith("Bearer ")) {
            return res
                .status(401)
                .json({ message: "Missing or invalid Authorization header" });
        }
        const token = auth.slice(7).trim();
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        }
        catch (err) {
            return res.status(401).json({ message: "Invalid or expired token" });
        }
        const userId = payload.sub;
        if (!userId) {
            return res.status(401).json({ message: "Token missing subject claim" });
        }
        const user = await User_1.default.findById(userId).exec();
        if (!user) {
            return res.status(401).json({ message: "User not found for token" });
        }
        // Check if user is banned
        if (user.isBanned) {
            const banReason = user.banReason || "Account suspended";
            return res.status(403).json({
                message: "Account has been suspended",
                reason: banReason,
                banned: true
            });
        }
        // attach the mongoose user document for downstream handlers
        req.user = user;
        req.authToken = token;
        next();
    }
    catch (err) {
        next(err);
    }
}
/**
 * GET /api/v1/user/profile
 * Returns the user's public profile and simple stats.
 */
router.get("/profile", requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const settings = await SystemSettings_1.default.getSettings().catch(() => null);
        const activityStats = (0, activityProgression_1.getActivityStats)(user.activityStats);
        const currentBadges = (0, activityProgression_1.getActivityBadges)(user.activityBadges);
        const mergedBadges = (0, activityProgression_1.evaluateAndMergeBadges)(activityStats, currentBadges, user.createdAt);
        const badgesChanged = JSON.stringify(currentBadges) !== JSON.stringify(mergedBadges);
        if (badgesChanged) {
            user.activityBadges = mergedBadges;
            await user.save();
        }
        const progression = (0, activityProgression_1.calculateActivityProgress)(Number(user.activityScore || 0), settings?.activityLevelThresholds);
        const badges = (0, activityProgression_1.getActivityBadgeViews)(mergedBadges);
        const completedTotal = (activityStats.offersCompleted || 0) +
            (activityStats.surveysCompleted || 0);
        // Basic derived stats. In a full implementation these would be aggregated
        // from tasks, game_plays, leaderboards, etc.
        const profile = {
            _id: user._id,
            uuid: user.uuid,
            username: user.username,
            displayName: user.displayName ?? null,
            avatarUrl: user.avatarUrl ?? null,
            email: user.email,
            balanceCents: user.balanceCents,
            affiliateCode: user.affiliateCode ?? null,
            referredBy: user.referredBy ?? null,
            profilePrivacy: user.profilePrivacy ?? 'public',
            profileCompleted: user.profileCompleted === true,
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
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/user/lookup
 * Public endpoint to lookup a user's public display name and avatar by email.
 * This is intended to allow client-side UIs to quickly display a friendly
 * name/avatar when the app-level session has not yet been established.
 * NOTE: Be cautious with this in production — consider rate-limiting or
 * requiring additional auth if exposing user enumeration is a concern.
 */
router.post("/lookup", (0, express_validator_1.body)("email").isEmail().normalizeEmail(), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        }
        const { email } = req.body;
        const user = await User_1.default.findOne({
            email: email.toLowerCase().trim(),
        }).exec();
        if (!user)
            return res.status(404).json({ message: "User not found" });
        return res.json({
            name: user.displayName && user.displayName.length > 0
                ? user.displayName
                : user.username,
            avatarUrl: user.avatarUrl ?? null,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/user/stats
 * Returns live/real-time style stats for the user (lightweight).
 */
router.get("/stats", requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
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
            retrievedAt: (0, dayjs_1.default)().toISOString(),
        };
        return res.json(liveStats);
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/user/settings
 * Returns current personal information (username, email, dob, postcode).
 */
router.get("/settings", requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        return res.json({
            username: user.username,
            email: user.email,
            dob: user.dob ? (0, dayjs_1.default)(user.dob).format("YYYY-MM-DD") : null,
            postcode: user.postcode ?? null,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * PUT /api/v1/user/settings
 * Body may contain: username, email, dob (YYYY-MM-DD), postcode
 */
router.put("/settings", requireAuth, (0, express_validator_1.body)("username").optional().isString().isLength({ min: 3, max: 30 }).trim(), (0, express_validator_1.body)("email").optional().isEmail().normalizeEmail(), (0, express_validator_1.body)("dob").optional().isISO8601().toDate(), (0, express_validator_1.body)("postcode").optional().isString().trim().isLength({ min: 2, max: 20 }), (0, express_validator_1.body)("profilePrivacy").optional().isIn(['public', 'private']), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        }
        const user = req.user;
        const { username, email, dob, postcode, profilePrivacy } = req.body;
        // If changing email or username, ensure uniqueness
        if (email && email.toLowerCase().trim() !== user.email) {
            const existingByEmail = await User_1.default.findOne({
                email: email.toLowerCase().trim(),
            }).exec();
            if (existingByEmail) {
                return res.status(409).json({ message: "Email already in use" });
            }
            user.email = email.toLowerCase().trim();
        }
        if (username && username.trim() !== user.username) {
            const existingByUsername = await User_1.default.findOne({
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
            user.profilePrivacy = profilePrivacy;
        }
        await user.save();
        // Emit a socket event to the user room so their UI updates in realtime
        try {
            const io = req.app.locals?.io;
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
        }
        catch (e) {
            // ignore emitting failures
        }
        return res.json({
            username: user.username,
            email: user.email,
            dob: user.dob ? (0, dayjs_1.default)(user.dob).format("YYYY-MM-DD") : null,
            postcode: user.postcode ?? null,
            updatedAt: user.updatedAt,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * PATCH /api/v1/user/profile
 * Partial update of user profile (supports profilePrivacy and other fields)
 */
router.patch("/profile", requireAuth, (0, express_validator_1.body)("profilePrivacy").optional().isIn(['public', 'private']), (0, express_validator_1.body)("displayName").optional().isString().trim(), (0, express_validator_1.body)("avatarUrl").optional().isString().trim(), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        }
        const user = req.user;
        const { profilePrivacy, displayName, avatarUrl } = req.body;
        if (profilePrivacy !== undefined) {
            user.profilePrivacy = profilePrivacy;
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
            profilePrivacy: user.profilePrivacy,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/user/tasks
 * Returns the user's tasks (progress). Currently a stub returning an empty list.
 * Replace with real task fetching once Task model is available.
 */
router.get("/tasks", requireAuth, async (_req, res, next) => {
    try {
        // TODO: Implement Task model and query tasks for the user.
        return res.json({ tasks: [] });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/user/daily-checkin
 * Returns whether the user is eligible to claim today's daily bonus and the last claimed time.
 */
router.get("/daily-checkin", requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const lastClaimed = user.lastDailyCheckin
            ? new Date(user.lastDailyCheckin)
            : null;
        const today = (0, dayjs_1.default)().startOf("day");
        const eligible = !lastClaimed || (0, dayjs_1.default)(lastClaimed).isBefore(today);
        return res.json({ eligible, lastClaimedAt: lastClaimed });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/user/daily-checkin/claim
 * Claims the daily $0.10 bonus for the authenticated user.
 */
router.post("/daily-checkin/claim", requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const lastClaimed = user.lastDailyCheckin
            ? new Date(user.lastDailyCheckin)
            : null;
        const today = (0, dayjs_1.default)().startOf("day");
        if (lastClaimed && !(0, dayjs_1.default)(lastClaimed).isBefore(today)) {
            return res.status(400).json({ message: "Daily bonus already claimed" });
        }
        const rewardCents = 10; // $0.10
        // update wallet and streak atomically
        // simple logic: if last claimed was yesterday, increment streak; otherwise reset to 1
        const yesterday = (0, dayjs_1.default)().subtract(1, "day").startOf("day");
        if (lastClaimed && (0, dayjs_1.default)(lastClaimed).isSame(yesterday, "day")) {
            user.streakDays = (user.streakDays || 0) + 1;
        }
        else {
            user.streakDays = 1;
        }
        user.balanceCents = (user.balanceCents || 0) + rewardCents;
        user.lastDailyCheckin = new Date();
        await user.save();
        // Emit a socket event to the user room so their UI updates in realtime
        try {
            const io = req.app.locals?.io;
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
        }
        catch (e) {
            // ignore emitting failures
        }
        return res.json({
            message: "Daily bonus claimed",
            rewardCents,
            newBalanceCents: user.balanceCents,
            claimedAt: user.lastDailyCheckin,
            streakDays: user.streakDays,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/user/bonus-code/redeem
 * Redeems a promo code and credits the user's balance.
 * Body: { code: string }
 */
router.post("/bonus-code/redeem", requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const { code } = req.body;
        if (!code || typeof code !== "string") {
            return res.status(400).json({ message: "Code is required" });
        }
        // Find the promo code
        const promoCode = await PromoCode_1.default.findOne({
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
        if (promoCode.expiresAt && (0, dayjs_1.default)().isAfter((0, dayjs_1.default)(promoCode.expiresAt))) {
            return res.status(410).json({ message: "Code expired" });
        }
        // Check if code is valid (hasn't started yet)
        if (promoCode.validFrom && (0, dayjs_1.default)().isBefore((0, dayjs_1.default)(promoCode.validFrom))) {
            return res.status(400).json({ message: "Code is not yet valid" });
        }
        // Check if usage limit reached
        if (promoCode.usedCount >= promoCode.usageLimit) {
            return res.status(410).json({ message: "Code usage limit reached" });
        }
        // Check if user already used this code (based on maxUsesPerUser)
        const userId = user._id;
        const userUsageCount = promoCode.usedBy.filter((id) => id.toString() === userId.toString()).length;
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
            const io = req.app.locals?.io;
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
        }
        catch (e) {
            // ignore emitting failures
        }
        // Increment usedCount and add user to usedBy array atomically
        await PromoCode_1.default.updateOne({ _id: promoCode._id }, {
            $inc: { usedCount: 1 },
            $addToSet: { usedBy: userId }
        }).exec();
        return res.json({
            message: "Bonus redeemed",
            rewardCents: promoCode.amountCents,
            newBalanceCents: user.balanceCents,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/user/debug/:email
 * Debug endpoint to check what's stored in the database for a user
 * Remove this in production!
 */
router.get("/debug/:email", async (req, res, next) => {
    try {
        const { email } = req.params;
        const user = await User_1.default.findOne({
            email: email.toLowerCase().trim(),
        }).exec();
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        return res.json({
            _id: user._id,
            uuid: user.uuid,
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
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/user/admin/add-balance
 * Admin endpoint to add test balance to a user account
 * IMPORTANT: This should be removed or secured in production!
 */
router.post("/admin/add-balance", (0, express_validator_1.body)("email").isEmail().notEmpty(), (0, express_validator_1.body)("amountInDollars").isFloat({ min: 0.01 }), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { email, amountInDollars } = req.body;
        const user = await User_1.default.findOne({ email: email.toLowerCase() });
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
    }
    catch (err) {
        next(err);
    }
});
// =============================================
// TWO-FACTOR AUTHENTICATION (2FA) ROUTES
// =============================================
/**
 * GET /api/v1/user/2fa/status
 * Get current 2FA status for the user
 */
router.get("/2fa/status", requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        return res.json({
            enabled: !!user.twoFactorEnabled,
            hasBackupCodes: !!(user.twoFactorBackupCodes?.length > 0),
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/user/2fa/setup
 * Initialize 2FA setup - generates secret and returns QR code data
 */
router.post("/2fa/setup", requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        // Generate a new TOTP secret
        const secret = generateTOTPSecret();
        // Store temporarily (not enabled until verified)
        user.twoFactorTempSecret = secret;
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
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/user/2fa/verify
 * Verify the 2FA setup with a code from authenticator app
 */
router.post("/2fa/verify", requireAuth, (0, express_validator_1.body)("code").isString().isLength({ min: 6, max: 6 }), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const user = req.user;
        const { code } = req.body;
        const tempSecret = user.twoFactorTempSecret;
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
        user.twoFactorSecret = tempSecret;
        user.twoFactorEnabled = true;
        user.twoFactorBackupCodes = backupCodes.map(code => ({
            code,
            used: false,
        }));
        user.twoFactorTempSecret = undefined;
        await user.save();
        return res.json({
            success: true,
            message: "Two-factor authentication enabled successfully!",
            backupCodes,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/user/2fa/disable
 * Disable 2FA for the user (requires password or valid 2FA code)
 */
router.post("/2fa/disable", requireAuth, (0, express_validator_1.body)("code").isString().isLength({ min: 6, max: 8 }), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const user = req.user;
        const { code } = req.body;
        if (!user.twoFactorEnabled) {
            return res.status(400).json({
                success: false,
                message: "Two-factor authentication is not enabled.",
            });
        }
        const secret = user.twoFactorSecret;
        // Check if it's a valid TOTP code
        let isValid = verifyTOTP(secret, code);
        // If not, check backup codes
        if (!isValid) {
            const backupCodes = user.twoFactorBackupCodes || [];
            const backupIndex = backupCodes.findIndex((bc) => bc.code === code.toUpperCase() && !bc.used);
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
        user.twoFactorSecret = undefined;
        user.twoFactorEnabled = false;
        user.twoFactorBackupCodes = [];
        await user.save();
        return res.json({
            success: true,
            message: "Two-factor authentication has been disabled.",
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/user/2fa/validate
 * Validate a 2FA code (used during login)
 */
router.post("/2fa/validate", (0, express_validator_1.body)("code").isString().isLength({ min: 6, max: 8 }), (0, express_validator_1.body)("userId").isString(), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { code, userId } = req.body;
        const user = await User_1.default.findById(userId).exec();
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }
        if (!user.twoFactorEnabled) {
            return res.status(400).json({
                success: false,
                message: "Two-factor authentication is not enabled for this account.",
            });
        }
        const secret = user.twoFactorSecret;
        // Check if it's a valid TOTP code
        let isValid = verifyTOTP(secret, code);
        // If not, check backup codes
        if (!isValid) {
            const backupCodes = user.twoFactorBackupCodes || [];
            const backupIndex = backupCodes.findIndex((bc) => bc.code === code.toUpperCase() && !bc.used);
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
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/user/2fa/regenerate-backup
 * Regenerate backup codes
 */
router.post("/2fa/regenerate-backup", requireAuth, (0, express_validator_1.body)("code").isString().isLength({ min: 6, max: 6 }), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const user = req.user;
        const { code } = req.body;
        if (!user.twoFactorEnabled) {
            return res.status(400).json({
                success: false,
                message: "Two-factor authentication is not enabled.",
            });
        }
        const secret = user.twoFactorSecret;
        // Verify the code first
        if (!verifyTOTP(secret, code)) {
            return res.status(400).json({
                success: false,
                message: "Invalid verification code.",
            });
        }
        // Generate new backup codes
        const backupCodes = generateBackupCodes();
        user.twoFactorBackupCodes = backupCodes.map(code => ({
            code,
            used: false,
        }));
        await user.save();
        return res.json({
            success: true,
            message: "New backup codes generated successfully.",
            backupCodes,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/user/change-password
 * Changes the authenticated user's password.
 * body: { currentPassword: string, newPassword: string }
 */
router.post("/change-password", requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
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
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=user.js.map