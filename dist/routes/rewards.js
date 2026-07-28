"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dayjs_1 = __importDefault(require("dayjs"));
const User_1 = __importDefault(require("../models/User"));
const router = (0, express_1.Router)();
// middleware copied from user route for auth verification
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || "please-change-this-secret";
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
            return res.status(401).json({ message: "Invalid token" });
        }
        const user = await User_1.default.findById(payload.sub).exec();
        if (!user)
            return res.status(401).json({ message: "User not found" });
        req.user = user;
        next();
    }
    catch (err) {
        next(err);
    }
}
/**
 * GET /api/v1/rewards/streaks
 * Returns a 7-day streak box definition for the user with claimable status
 */
router.get("/streaks", requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const lastClaimed = user.lastDailyCheckin ? new Date(user.lastDailyCheckin) : null;
        const today = (0, dayjs_1.default)().startOf("day");
        const eligible = !lastClaimed || (0, dayjs_1.default)(lastClaimed).isBefore(today);
        // Build 7-day boxes; imageKey is a logical name front-end can map to a local asset
        const boxes = Array.from({ length: 7 }).map((_, i) => {
            const day = i + 1;
            // claimable only for the current next day in the streak if eligible and day equals streakDays+1
            const nextDay = (user.streakDays || 0) + 1;
            const claimable = eligible && day === nextDay;
            return {
                day,
                title: `Day ${day}`,
                imageKey: `streak-box-${day}`,
                claimable,
            };
        });
        return res.json({ boxes, eligible, streakDays: user.streakDays || 0, lastClaimedAt: lastClaimed });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/rewards/bonus
 * Returns signup bonus progress data (48h window from user creation).
 */
router.get("/bonus", requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const createdAt = user.createdAt ? new Date(user.createdAt) : new Date();
        const expiresAt = (0, dayjs_1.default)(createdAt).add(48, "hour").toDate();
        const now = new Date();
        const timeRemainingMs = Math.max(0, expiresAt.getTime() - now.getTime());
        const totalEarnedCents = (user.totalEarned || 0) + (user.balanceCents || 0);
        const targetCents = 200;
        const earnedSoFar = Math.min(totalEarnedCents, targetCents);
        const progress = targetCents > 0 ? (earnedSoFar / targetCents) * 100 : 0;
        const boxes = [
            { id: 1, claimed: totalEarnedCents >= 25 },
            { id: 2, claimed: totalEarnedCents >= 50 },
            { id: 3, claimed: totalEarnedCents >= 200, highlight: true },
            { id: 4, claimed: totalEarnedCents >= 5 },
            { id: 5, claimed: totalEarnedCents >= 25 },
            { id: 6, claimed: totalEarnedCents >= 50 },
        ];
        return res.json({
            expiresAt,
            timeRemainingMs,
            earnedCents: earnedSoFar,
            targetCents,
            progress: Math.round(progress * 10) / 10,
            boxes,
            expired: timeRemainingMs <= 0,
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=rewards.js.map