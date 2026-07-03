"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const requireAuth_1 = __importDefault(require("../utils/requireAuth"));
const ReferralEarning_1 = __importDefault(require("../models/ReferralEarning"));
const router = (0, express_1.Router)();
/**
 * GET /api/v1/user/referrals
 * Returns referral link, basic stats and total earned
 */
router.get('/', requireAuth_1.default, async (req, res, next) => {
    try {
        const user = req.user;
        const affiliateCode = user.affiliateCode || null;
        const referralLink = affiliateCode ? `${process.env.FRONTEND_BASE_URL || 'https://earnlab.example'}/join?ref=${affiliateCode}` : null;
        // aggregate referral earnings
        const totalEarnedAgg = await ReferralEarning_1.default.aggregate([
            { $match: { referrer: user._id, claimed: true } },
            { $group: { _id: null, total: { $sum: '$amountCents' } } },
        ]).exec();
        const totalEarned = (totalEarnedAgg[0] && totalEarnedAgg[0].total) || 0;
        const availableAgg = await ReferralEarning_1.default.aggregate([
            { $match: { referrer: user._id, claimed: false } },
            { $group: { _id: null, total: { $sum: '$amountCents' }, count: { $sum: 1 } } },
        ]).exec();
        const available = (availableAgg[0] && availableAgg[0].total) || 0;
        const pendingCount = (availableAgg[0] && availableAgg[0].count) || 0;
        return res.json({ affiliateCode, referralLink, totalEarnedCents: totalEarned, availableCents: available, pendingCount });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/user/referrals/claim
 * Claims available referral earnings (moves to user balance and marks earnings claimed)
 */
router.post('/claim', requireAuth_1.default, async (req, res, next) => {
    try {
        const user = req.user;
        const earnings = await ReferralEarning_1.default.find({ referrer: user._id, claimed: false }).exec();
        if (!earnings || earnings.length === 0) {
            return res.status(400).json({ message: 'No referral earnings available to claim' });
        }
        const total = earnings.reduce((s, e) => s + e.amountCents, 0);
        // mark claimed
        await ReferralEarning_1.default.updateMany({ referrer: user._id, claimed: false }, { $set: { claimed: true } }).exec();
        // add to user balance
        user.balanceCents = (user.balanceCents || 0) + total;
        await user.save();
        return res.json({ claimedCents: total, newBalanceCents: user.balanceCents });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=referrals.js.map