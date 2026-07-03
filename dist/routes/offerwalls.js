"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gamesRouter = void 0;
const express_1 = require("express");
const mongoose_1 = __importStar(require("mongoose"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dayjs_1 = __importDefault(require("dayjs"));
const User_1 = __importDefault(require("../models/User"));
const Task_1 = __importDefault(require("../models/Task"));
const OfferLog_1 = __importDefault(require("../models/OfferLog"));
const Withdrawal_1 = __importDefault(require("../models/Withdrawal"));
const ReferralEarning_1 = __importDefault(require("../models/ReferralEarning"));
const PremiumOffer_1 = __importDefault(require("../models/PremiumOffer"));
const SystemSettings_1 = __importDefault(require("../models/SystemSettings"));
const Notification_1 = __importDefault(require("../models/Notification"));
const activityProgression_1 = require("../utils/activityProgression");
const offerwallsRouter = (0, express_1.Router)();
const gamesRouter = (0, express_1.Router)();
exports.gamesRouter = gamesRouter;
const JWT_SECRET = process.env.JWT_SECRET || "please-change-this-secret";
const OfferwallSchema = new mongoose_1.Schema({
    name: { type: String, required: true, index: true },
    displayName: { type: String, required: false },
    type: { type: String, required: true, index: true }, // e.g., vertical, custom, client
    description: { type: String, required: false },
    logoUrl: { type: String, required: false },
    status: { type: String, required: false },
    isActive: { type: Boolean, required: false, default: true, index: true },
    priority: { type: Number, required: false, default: 0 },
    metadata: { type: mongoose_1.Schema.Types.Mixed, required: false },
}, { timestamps: true, strict: false });
// IMPORTANT: Admin panel stores offerwalls under model name "OfferWall".
// Public routes should read the same collection so frontend /earn reflects admin uploads.
const Offerwall = mongoose_1.default.models.OfferWall ||
    mongoose_1.default.models.Offerwall ||
    (0, mongoose_1.model)("OfferWall", OfferwallSchema);
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/earnlab";
offerwallsRouter.use(async (_req, _res, next) => {
    try {
        if (mongoose_1.default.connection.readyState !== 1) {
            await mongoose_1.default.connect(MONGODB_URI);
        }
        next();
    }
    catch (err) {
        next(err);
    }
});
const BonusCodeSchema = new mongoose_1.Schema({
    code: { type: String, required: true, unique: true, index: true },
    rewardCents: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: false, default: null },
    usesAllowed: { type: Number, required: true, default: 1 },
    usesCount: { type: Number, required: true, default: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } });
const BonusCode = mongoose_1.default.models.BonusCode || (0, mongoose_1.model)("BonusCode", BonusCodeSchema);
/**
 * --- Helper: authenticate middleware ---
 * Verifies Bearer token, finds user and attaches to req as `req.user`.
 * This middleware is intentionally small and tolerates tokens signed with the app secret.
 */
async function requireAuth(req, res, next) {
    try {
        const auth = req.header("authorization");
        if (!auth || !auth.startsWith("Bearer "))
            return res.status(401).json({ message: "Missing Authorization" });
        const token = auth.slice(7).trim();
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        }
        catch (err) {
            return res.status(401).json({ message: "Invalid or expired token" });
        }
        const userId = payload.sub;
        if (!userId)
            return res.status(401).json({ message: "Token missing subject" });
        // Attempt to find by MongoDB _id first, fallback to uuid by searching the `uuid` field.
        let user = null;
        if (mongoose_1.default.Types.ObjectId.isValid(userId)) {
            user = await User_1.default.findById(userId).exec();
        }
        if (!user) {
            user = await User_1.default.findOne({ uuid: userId }).exec();
        }
        if (!user)
            return res.status(401).json({ message: "User not found" });
        req.user = user;
        req.authToken = token;
        next();
    }
    catch (err) {
        next(err);
    }
}
/**
 * --- Offerwalls routes ---
 *
 * GET /api/v1/offerwalls
 *   Lists all vertical Offerwalls (or all offerwalls)
 *
 * GET /api/v1/offerwalls/custom
 *   Returns the client's "Own Offerwall" — personalized a bit if user is authenticated.
 */
// List offerwalls (with optional type filter)
offerwallsRouter.get("/", async (req, res, next) => {
    try {
        const { type } = req.query;
        // Public listing should not expose disabled/inactive offerwalls
        // (`$ne: false` also keeps backward compatibility for legacy documents
        // that don't have `isActive` set yet).
        const filter = { isActive: { $ne: false } };
        if (type && typeof type === "string")
            filter.type = type;
        // In production we would paginate; for demo return up to 100
        const offerwalls = await Offerwall.find(filter)
            .sort({ priority: -1, createdAt: -1 })
            .limit(100)
            .lean()
            .exec();
        // Keep both shapes for compatibility with older/newer frontend builds.
        return res.json({ success: true, data: offerwalls, offerwalls });
    }
    catch (err) {
        next(err);
    }
});
// Get client's custom offerwall
offerwallsRouter.get("/custom", async (req, res, next) => {
    try {
        // If user token provided, personalize by affiliate code
        const auth = req.header("authorization");
        let affiliateInfo = null;
        if (auth && auth.startsWith("Bearer ")) {
            try {
                const token = auth.slice(7).trim();
                const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
                const userId = payload.sub;
                let user = null;
                if (mongoose_1.default.Types.ObjectId.isValid(userId))
                    user = await User_1.default.findById(userId).exec();
                if (!user)
                    user = await User_1.default.findOne({ uuid: userId }).exec();
                if (user) {
                    affiliateInfo = {
                        affiliateCode: user.affiliateCode ?? null,
                        username: user.username,
                    };
                }
            }
            catch {
                // ignore token errors for this endpoint and return non-personalized content
            }
        }
        // Try to find a special offerwall of type 'client' or 'custom'
        let custom = await Offerwall.findOne({
            type: { $in: ["client", "custom"] },
        })
            .lean()
            .exec();
        if (!custom) {
            // fallback: synthesize a custom offerwall
            custom = {
                name: "Labwards Custom Offerwall",
                type: "custom",
                metadata: {
                    description: "Client owned offerwall with targeted offers.",
                    sampleOffers: [
                        { id: "o1", title: "Install App A - $0.50", rewardCents: 50 },
                        { id: "o2", title: "Sign up for B - $1.00", rewardCents: 100 },
                    ],
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        }
        // If we have affiliate info, add referral tracking param to metadata
        if (affiliateInfo) {
            // cast to `any` to satisfy TypeScript when `custom` can be a lean document or our fallback object
            custom.metadata = custom.metadata || {};
            custom.metadata.referral =
                affiliateInfo.affiliateCode || `user:${affiliateInfo.username}`;
        }
        return res.json({ offerwall: custom, affiliate: affiliateInfo });
    }
    catch (err) {
        next(err);
    }
});
/**
 * --- Games routes (red-or-black) ---
 *
 * GET  /api/v1/games/red-or-black           -> Gets game status/stats
 * POST /api/v1/games/red-or-black/play      -> Submits a game play (requires auth)
 *
 * Additional endpoints implemented here (user daily checkin & bonus redemption)
 * GET  /api/v1/user/daily-checkin
 * POST /api/v1/user/daily-checkin/claim
 * POST /api/v1/user/bonus-code/redeem
 *
 * Note: For simplicity these routes store minimal state on the user document
 * (e.g. lastDailyCheckin) and in the BonusCode collection created above.
 */
// Simple in-memory stats for the game (could be persisted)
const RED_OR_BLACK_STATS = {
    minStakeCents: 10, // $0.10
    maxStakeCents: 10000, // $100.00
    houseEdgePercent: 1.0, // 1% house edge example
    description: "Pick red or black. Win doubles your stake, otherwise you lose your stake.",
};
// GET status/stats
gamesRouter.get("/red-or-black", async (_req, res) => {
    return res.json({ game: "red-or-black", stats: RED_OR_BLACK_STATS });
});
// POST play
// Body: { stakeCents: number, choice: 'red'|'black' }
gamesRouter.post("/red-or-black/play", requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const { stakeCents, choice } = req.body;
        if (typeof stakeCents !== "number" || stakeCents <= 0) {
            return res.status(400).json({ message: "Invalid stake amount" });
        }
        // ensure `choice` is explicitly one of the allowed strings (guard against undefined)
        if (choice !== "red" && choice !== "black") {
            return res
                .status(400)
                .json({ message: 'Choice must be \"red\" or \"black\"' });
        }
        if (stakeCents < RED_OR_BLACK_STATS.minStakeCents ||
            stakeCents > RED_OR_BLACK_STATS.maxStakeCents) {
            return res.status(400).json({ message: "Stake out of allowed range" });
        }
        // Ensure user has enough balance
        if (user.balanceCents < stakeCents) {
            return res.status(402).json({ message: "Insufficient balance" });
        }
        // Deduct stake optimistically
        user.balanceCents = Math.max(0, user.balanceCents - stakeCents);
        // Determine random outcome
        // Simplest approach: random 50/50
        const outcome = Math.random() < 0.5 ? "red" : "black";
        let rewardCents = 0;
        let won = false;
        if (outcome === choice) {
            // Payout = stake * 2 minus house edge
            const gross = stakeCents * 2;
            const edge = Math.round((RED_OR_BLACK_STATS.houseEdgePercent / 100) * gross);
            rewardCents = Math.max(0, gross - edge);
            won = true;
            user.balanceCents += rewardCents;
        }
        await user.save();
        // For observability we return the play result
        return res.json({
            outcome,
            choice,
            won,
            rewardCents,
            newBalanceCents: user.balanceCents,
            playedAt: new Date().toISOString(),
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * --- Daily checkin endpoints ---
 *
 * GET  /api/v1/user/daily-checkin   -> returns { eligible: boolean, lastClaimedAt }
 * POST /api/v1/user/daily-checkin/claim -> claims the daily $0.10 bonus (10 cents)
 */
gamesRouter.get("/user/daily-checkin", requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        // read lastDailyCheckin from user doc (non-strict schema usage)
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
gamesRouter.post("/user/daily-checkin/claim", requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const lastClaimed = user.lastDailyCheckin
            ? new Date(user.lastDailyCheckin)
            : null;
        const today = (0, dayjs_1.default)().startOf("day");
        // Dayjs `isSameOrAfter` is not available by default; use isBefore to express the inverse
        if (lastClaimed && !(0, dayjs_1.default)(lastClaimed).isBefore(today)) {
            return res.status(400).json({ message: "Daily bonus already claimed" });
        }
        // award 10 cents ($0.10) = 10 cents
        const rewardCents = 10;
        user.balanceCents = (user.balanceCents || 0) + rewardCents;
        user.lastDailyCheckin = new Date();
        await user.save();
        return res.json({
            message: "Daily bonus claimed",
            rewardCents,
            newBalanceCents: user.balanceCents,
            claimedAt: user.lastDailyCheckin,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * --- Leaderboard (monthly) ---
 *
 * GET /api/v1/leaderboard/monthly
 * Returns top users by balanceCents as a simple monthly leaderboard (demo).
 */
gamesRouter.get("/leaderboard/monthly", async (req, res, next) => {
    try {
        // In a real app you'd compute based on period/transactions. For demo, use balanceCents.
        const top = await User_1.default.find({})
            .sort({ balanceCents: -1 })
            .limit(10)
            .select("uuid username balanceCents displayName avatarUrl profilePrivacy")
            .lean()
            .exec();
        const period = (0, dayjs_1.default)().format("YYYY-MM");
        return res.json({ period, top });
    }
    catch (err) {
        next(err);
    }
});
/**
 * --- Get user profile by ID ---
 *
 * GET /api/v1/games/user/:userId
 * Returns user profile if public, or privacy message if private
 */
gamesRouter.get("/user/:userId", async (req, res, next) => {
    try {
        const { userId } = req.params;
        // Find user by uuid or _id
        let user = null;
        if (mongoose_1.default.Types.ObjectId.isValid(userId)) {
            user = await User_1.default.findById(userId).lean().exec();
        }
        if (!user) {
            user = await User_1.default.findOne({ uuid: userId }).lean().exec();
        }
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const settings = await SystemSettings_1.default.getSettings().catch(() => null);
        const activityStats = (0, activityProgression_1.getActivityStats)(user.activityStats);
        const mergedBadges = (0, activityProgression_1.evaluateAndMergeBadges)(activityStats, (0, activityProgression_1.getActivityBadges)(user.activityBadges), user.createdAt);
        const progression = (0, activityProgression_1.calculateActivityProgress)(Number(user.activityScore || 0), settings?.activityLevelThresholds);
        const badges = (0, activityProgression_1.getActivityBadgeViews)(mergedBadges);
        // Check privacy setting
        const privacy = user.profilePrivacy || 'public';
        if (privacy === 'private') {
            return res.json({
                isPrivate: true,
                message: "This profile is private",
                username: user.username,
            });
        }
        // Aggregate stats for public profile
        let offersCompleted = 0;
        let totalEarningsCents = user.balanceCents || 0;
        let last30DaysCents = 0;
        let recentOffers = [];
        try {
            // Task stats
            offersCompleted = await Task_1.default.countDocuments({ userId: user._id, status: "completed" });
            // Total earnings from completed tasks
            const earningsAgg = await Task_1.default.aggregate([
                { $match: { userId: user._id, status: "completed" } },
                { $group: { _id: null, total: { $sum: "$rewardCents" } } },
            ]);
            if (earningsAgg.length > 0)
                totalEarningsCents = earningsAgg[0].total || 0;
            // Last 30 days earnings
            const thirtyDaysAgo = (0, dayjs_1.default)().subtract(30, "day").toDate();
            const last30Agg = await Task_1.default.aggregate([
                { $match: { userId: user._id, status: "completed", completedAt: { $gte: thirtyDaysAgo } } },
                { $group: { _id: null, total: { $sum: "$rewardCents" } } },
            ]);
            if (last30Agg.length > 0)
                last30DaysCents = last30Agg[0].total || 0;
            // Recent completed offers for table
            recentOffers = await Task_1.default.find({ userId: user._id, status: "completed" })
                .sort({ completedAt: -1 })
                .limit(5)
                .select("title rewardCents completedAt metadata")
                .lean()
                .exec();
        }
        catch (_taskErr) {
            // Task model not available; fall back to balance-based values
        }
        // Referral count: how many users this user has referred
        const referralCount = await User_1.default.countDocuments({ referredBy: user._id }).exec();
        const formattedOffers = recentOffers.map((t) => ({
            _id: t._id,
            title: t.title || "Untitled",
            rewardCents: t.rewardCents || 0,
            completedAt: t.completedAt || t.updatedAt,
            provider: t.metadata?.provider || t.metadata?.providerName || null,
            imageUrl: t.metadata?.imageUrl || t.metadata?.iconUrl || null,
        }));
        // Return public profile data with stats
        return res.json({
            isPrivate: false,
            profile: {
                uuid: user.uuid,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
                emoji: user.emoji || null,
                countryCode: user.countryCode || null,
                balanceCents: user.balanceCents,
                createdAt: user.createdAt,
                activityScore: progression.activityScore,
                activityLevel: progression.currentLevel,
            },
            stats: {
                offersCompleted,
                totalEarningsCents,
                last30DaysCents,
                referralCount,
            },
            progression,
            badges,
            recentOffers: formattedOffers,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * --- Get user's completed offers ---
 *
 * GET /api/v1/user/:userId/completed-offers
 * Returns list of completed tasks/offers for a user (respects privacy)
 */
gamesRouter.get("/user/:userId/completed-offers", async (req, res, next) => {
    try {
        const { userId } = req.params;
        // Find user by uuid or _id
        let user = null;
        if (mongoose_1.default.Types.ObjectId.isValid(userId)) {
            user = await User_1.default.findById(userId).lean().exec();
        }
        if (!user) {
            user = await User_1.default.findOne({ uuid: userId }).lean().exec();
        }
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        // Check privacy setting
        const privacy = user.profilePrivacy || 'public';
        if (privacy === 'private') {
            return res.json({
                offers: [],
                message: "This profile is private",
            });
        }
        // Fetch completed tasks for this user
        const completedTasks = await Task_1.default.find({
            userId: user._id,
            status: "completed",
        })
            .sort({ completedAt: -1 })
            .limit(20)
            .select("title rewardCents completedAt metadata")
            .lean()
            .exec();
        const offers = completedTasks.map((task) => ({
            _id: task._id,
            title: task.title || task.name || "Untitled Task",
            rewardCents: task.rewardCents || 0,
            completedAt: task.completedAt || task.updatedAt,
            provider: task.metadata?.provider || task.metadata?.providerName || null,
        }));
        return res.json({ offers });
    }
    catch (err) {
        next(err);
    }
});
/**
 * --- Bonus code redeem ---
 *
 * POST /api/v1/user/bonus-code/redeem
 * Body: { code: string }
 */
gamesRouter.post("/user/bonus-code/redeem", requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const { code } = req.body;
        if (!code || typeof code !== "string") {
            return res.status(400).json({ message: "Code is required" });
        }
        // Find code
        const bonus = await BonusCode.findOne({
            code: code.trim().toUpperCase(),
        }).exec();
        if (!bonus)
            return res.status(404).json({ message: "Invalid bonus code" });
        if (bonus.expiresAt && (0, dayjs_1.default)().isAfter((0, dayjs_1.default)(bonus.expiresAt))) {
            return res.status(410).json({ message: "Code expired" });
        }
        if (bonus.usesCount >= bonus.usesAllowed) {
            return res.status(410).json({ message: "Code usage limit reached" });
        }
        // Apply reward
        user.balanceCents = (user.balanceCents || 0) + bonus.rewardCents;
        await user.save();
        // Increment usesCount (atomic update)
        await BonusCode.updateOne({ _id: bonus._id, usesCount: { $lt: bonus.usesAllowed } }, { $inc: { usesCount: 1 } }).exec();
        return res.json({
            message: "Bonus redeemed",
            rewardCents: bonus.rewardCents,
            newBalanceCents: user.balanceCents,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * --- Trending Offers from OfferWalls (Public) ---
 *
 * GET /api/v1/offerwalls/trending
 * Returns trending/best performing offers from integrated OfferWalls
 * These appear after Premium Offers in the horizontal slider
 */
offerwallsRouter.get("/trending", async (req, res, next) => {
    try {
        const { limit = 15 } = req.query;
        const limitNum = Math.min(parseInt(limit) || 15, 50);
        // Try to get offers from OfferLog (completed offers = trending/popular)
        // This shows real offers that users have completed
        let trendingOffers = [];
        try {
            // Aggregate to find most completed offers (trending)
            const popularOffers = await OfferLog_1.default.aggregate([
                { $match: { status: "approved" } },
                {
                    $group: {
                        _id: { offerName: "$offerName", provider: "$provider" },
                        count: { $sum: 1 },
                        avgReward: { $avg: "$rewardCents" },
                        lastCompleted: { $max: "$createdAt" },
                        imageUrl: { $first: "$metadata.imageUrl" },
                        trackingUrl: { $first: "$metadata.trackingUrl" }
                    }
                },
                { $sort: { count: -1, lastCompleted: -1 } },
                { $limit: limitNum }
            ]);
            trendingOffers = popularOffers.map((o) => ({
                _id: `trending-${o._id.offerName?.replace(/\\s+/g, '-')?.toLowerCase() || Math.random()}`,
                title: o._id.offerName || "Popular Offer",
                provider: o._id.provider || "OfferWall",
                rewardCents: Math.round(o.avgReward) || 100,
                imageUrl: o.imageUrl || null,
                trackingUrl: o.trackingUrl || null,
                completions: o.count
            }));
        }
        catch (err) {
            console.log("OfferLog not available, using fallback trending offers");
        }
        // If no trending offers from logs, get from Premium Offers as fallback
        if (trendingOffers.length === 0) {
            const fallbackOffers = await PremiumOffer_1.default.find({ status: "active" })
                .select("title description imageUrl rewardCents provider")
                .sort({ priority: -1 })
                .limit(limitNum)
                .lean();
            trendingOffers = fallbackOffers.map((o) => ({
                _id: o._id,
                title: o.title,
                description: o.description,
                imageUrl: o.imageUrl,
                rewardCents: o.rewardCents,
                provider: o.provider || "Premium",
            }));
        }
        res.json({
            offers: trendingOffers,
            total: trendingOffers.length,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * --- Premium Offers (Public) ---
 *
 * GET /api/v1/offerwalls/premium
 * Returns active premium offers for the frontend
 * Filters by platform based on user-agent or query param
 * Filters out offers that have reached their daily completion cap
 */
offerwallsRouter.get("/premium", async (req, res, next) => {
    try {
        const { platform, country, surface, limit = 20 } = req.query;
        const limitNum = parseInt(limit) || 20;
        // Get current date for daily cap check
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Build query for active, non-expired offers
        const query = {
            status: "active",
            $or: [
                { expiresAt: null },
                { expiresAt: { $gt: new Date() } },
            ],
        };
        // Filter by platform if specified
        const andConditions = [];
        if (platform && platform !== "all") {
            andConditions.push({ $or: [{ platform: platform }, { platform: "all" }] });
        }
        // Filter by country if specified
        if (country && typeof country === "string") {
            andConditions.push({
                $or: [
                    { country: { $size: 0 } }, // Global offers
                    { country: { $exists: false } }, // Global offers
                    { country: country }, // Matches specific country
                ],
            });
        }
        // Filter by surface placement when requested.
        // Keep backwards compatibility by allowing legacy docs (without field) to pass.
        if (surface === "home") {
            andConditions.push({
                $or: [
                    { showOnWelcomePage: true },
                    { showOnWelcomePage: { $exists: false } },
                ],
            });
        }
        if (surface === "earn") {
            andConditions.push({
                $or: [
                    { showOnEarnPage: true },
                    { showOnEarnPage: { $exists: false } },
                ],
            });
        }
        if (andConditions.length > 0) {
            query.$and = andConditions;
        }
        let offers = await PremiumOffer_1.default.find(query)
            .select("-createdBy -updatedBy")
            .sort({ priority: -1, createdAt: -1 })
            .limit(limitNum * 2) // Fetch extra to account for filtered capped offers
            .lean();
        // Filter out offers that have reached their daily cap
        offers = offers.filter((offer) => {
            // If no cap set, always show
            if (!offer.completionCap || offer.completionCap === null) {
                return true;
            }
            // Check if we need to reset daily completions (new day)
            const lastReset = offer.lastCapReset ? new Date(offer.lastCapReset) : null;
            if (!lastReset || lastReset < today) {
                // It's a new day, completions should be 0 (will be reset on next completion)
                return true;
            }
            // Check if cap is reached
            return (offer.dailyCompletions || 0) < offer.completionCap;
        }).slice(0, limitNum); // Limit to requested amount
        res.json({
            offers,
            total: offers.length,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * --- Get single Premium Offer (Public) ---
 *
 * GET /api/v1/offerwalls/premium/:id
 * Returns a single premium offer with tracking URL for starting
 * Checks if the offer has reached its daily completion cap
 */
offerwallsRouter.get("/premium/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid offer ID" });
        }
        const offer = await PremiumOffer_1.default.findOne({
            _id: id,
            status: "active",
        }).lean();
        if (!offer) {
            return res.status(404).json({ message: "Offer not found" });
        }
        // Check if expired
        if (offer.expiresAt && new Date(offer.expiresAt) < new Date()) {
            return res.status(410).json({ message: "Offer has expired" });
        }
        // Check if daily cap is reached
        if (offer.completionCap && offer.completionCap !== null) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const lastReset = offer.lastCapReset ? new Date(offer.lastCapReset) : null;
            const isNewDay = !lastReset || lastReset < today;
            const currentDailyCompletions = isNewDay ? 0 : (offer.dailyCompletions || 0);
            if (currentDailyCompletions >= offer.completionCap) {
                return res.status(410).json({
                    message: "Offer has reached its daily limit. Please try again tomorrow.",
                    capReached: true
                });
            }
        }
        res.json({ offer });
    }
    catch (err) {
        next(err);
    }
});
/**
 * --- Recent Activity (Public) ---
 *
 * GET /api/v1/offerwalls/recent-activity
 * Returns recent earnings, payouts for the live feed
 */
offerwallsRouter.get("/recent-activity", async (req, res, next) => {
    try {
        const { limit = 15 } = req.query;
        const limitNum = Math.min(parseInt(limit) || 15, 50);
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [recentPayouts, recentEarnings, recentReferrals, payout24hStats, offerPerformanceStats, referralRewardStats,] = await Promise.all([
            // Get recent completed withdrawals (payouts)
            Withdrawal_1.default.find({ status: "Completed" })
                .populate("user", "username avatarUrl countryCode country")
                .sort({ completedAt: -1, createdAt: -1 })
                .limit(limitNum)
                .lean(),
            // Get recent earnings
            OfferLog_1.default.find({ status: "approved" })
                .populate("user", "username avatarUrl countryCode country")
                .sort({ createdAt: -1 })
                .limit(limitNum)
                .lean(),
            // Get recent referral earnings
            ReferralEarning_1.default.find()
                .populate("referrer", "username avatarUrl countryCode country")
                .sort({ createdAt: -1 })
                .limit(limitNum)
                .lean(),
            // Real completed payout total in the last 24h
            Withdrawal_1.default.aggregate([
                { $match: { status: "Completed" } },
                {
                    $addFields: {
                        effectiveCompletedAt: { $ifNull: ["$completedAt", "$createdAt"] },
                    },
                },
                { $match: { effectiveCompletedAt: { $gte: last24h } } },
                {
                    $group: {
                        _id: null,
                        totalPayout24hCents: { $sum: "$amountCents" },
                        completedPayouts24hCount: { $sum: 1 },
                    },
                },
            ]),
            // Real offer performance totals
            OfferLog_1.default.aggregate([
                { $match: { status: "approved" } },
                {
                    $group: {
                        _id: null,
                        totalOfferRewardsCents: { $sum: "$amountCents" },
                        tasksCompletedCount: { $sum: 1 },
                        averageOfferRewardCents: { $avg: "$amountCents" },
                    },
                },
            ]),
            // Real referral rewards totals
            ReferralEarning_1.default.aggregate([
                {
                    $group: {
                        _id: null,
                        totalReferralRewardsCents: { $sum: "$amountCents" },
                    },
                },
            ]),
        ]);
        const totalPayout24hCents = payout24hStats?.[0]?.totalPayout24hCents ?? 0;
        const completedPayouts24hCount = payout24hStats?.[0]?.completedPayouts24hCount ?? 0;
        const totalOfferRewardsCents = offerPerformanceStats?.[0]?.totalOfferRewardsCents ?? 0;
        const tasksCompletedCount = offerPerformanceStats?.[0]?.tasksCompletedCount ?? 0;
        const averageMoneyEarnedCents = Math.round(offerPerformanceStats?.[0]?.averageOfferRewardCents ?? 0);
        const totalReferralRewardsCents = referralRewardStats?.[0]?.totalReferralRewardsCents ?? 0;
        const totalRewardsEarnedCents = totalOfferRewardsCents + totalReferralRewardsCents;
        // Combine and format activities
        const activities = [];
        recentPayouts.forEach((w) => {
            if (w.user) {
                activities.push({
                    type: "payout",
                    username: w.user?.username || "Anonymous",
                    avatarUrl: w.user?.avatarUrl,
                    countryCode: w.user?.countryCode || null,
                    countryName: w.user?.country || null,
                    amount: w.amountCents,
                    method: w.method,
                    timestamp: w.completedAt || w.createdAt,
                });
            }
        });
        recentEarnings.forEach((e) => {
            if (e.user) {
                activities.push({
                    type: "earning",
                    username: e.user?.username || "Anonymous",
                    avatarUrl: e.user?.avatarUrl,
                    countryCode: e.user?.countryCode || null,
                    countryName: e.user?.country || null,
                    amount: e.rewardCents || e.amountCents,
                    offerName: e.offerName,
                    provider: e.provider || e.offerwall,
                    timestamp: e.createdAt,
                });
            }
        });
        recentReferrals.forEach((r) => {
            if (r.referrer) {
                activities.push({
                    type: "referral",
                    username: r.referrer?.username || "Anonymous",
                    avatarUrl: r.referrer?.avatarUrl,
                    countryCode: r.referrer?.countryCode || null,
                    countryName: r.referrer?.country || null,
                    amount: r.amountCents,
                    timestamp: r.createdAt,
                });
            }
        });
        // Sort by timestamp and limit
        activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const countriesRepresentedCount = new Set(activities
            .map((activity) => activity.countryCode || activity.countryName)
            .filter(Boolean)).size;
        res.json({
            activities: activities.slice(0, limitNum),
            stats: {
                totalPayout24hCents,
                completedPayouts24hCount,
                totalRewardsEarnedCents,
                averageMoneyEarnedCents,
                tasksCompletedCount,
                countriesRepresentedCount,
                windowHours: 24,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * --- Survey completion endpoint ---
 *
 * POST /api/v1/surveys/complete
 * Saves onboarding/profile answers, marks profile as completed,
 * and increments survey completion stats.
 * Body: { providerId, providerName, answers: { ... }, completedAt }
 */
offerwallsRouter.post("/surveys/complete", requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const { providerId, providerName, answers, completedAt } = req.body;
        if (!answers || typeof answers !== "object") {
            return res.status(400).json({ message: "Survey answers are required" });
        }
        // Save survey answers and mark profile as completed
        user.surveyAnswers = answers;
        user.profileCompleted = true;
        // Increment surveys completed stat
        if (!user.activityStats) {
            user.activityStats = { surveysCompleted: 1, offersCompleted: 0, successfulReferrals: 0, dailyLogins: 0 };
        }
        else {
            user.activityStats.surveysCompleted = (user.activityStats.surveysCompleted || 0) + 1;
        }
        // Update activity score for survey completion
        user.activityScore = (user.activityScore || 0) + 3;
        await user.save();
        // Create a notification
        try {
            await Notification_1.default.create({
                user: user._id,
                type: "success",
                title: "Profile Survey Completed",
                body: "Your onboarding survey is complete! You can now access survey offerwalls and tasks.",
                read: false,
            });
        }
        catch (_notifErr) {
            // notification is non-critical
        }
        return res.status(200).json({
            message: "Survey completed successfully! Your profile has been updated.",
            profileCompleted: true,
            provider: providerName || providerId || null,
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = offerwallsRouter;
//# sourceMappingURL=offerwalls.js.map