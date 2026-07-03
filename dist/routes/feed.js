"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const FeedEvent_1 = __importDefault(require("../models/FeedEvent"));
const requireAuth_1 = __importDefault(require("../utils/requireAuth"));
const router = (0, express_1.Router)();
/**
 * GET /api/v1/feed/activity
 * Returns recent feed events (live earnings, withdrawals)
 */
router.get('/activity', async (_req, res, next) => {
    try {
        // return the most recent 50 events
        let events = await FeedEvent_1.default.find({}).sort({ createdAt: -1 }).limit(50).lean().exec();
        // if empty, return some synthetic sample feed data
        if (!events || events.length === 0) {
            events = [
                { type: 'earning', text: 'Alice earned $0.50 from an offer', amountCents: 50, createdAt: new Date() },
                { type: 'withdrawal', text: 'Bob requested a $5.00 withdrawal', amountCents: 500, createdAt: new Date(Date.now() - 60000) },
            ];
        }
        return res.json({ events });
    }
    catch (err) {
        next(err);
    }
});
/** optional: GET /api/v1/feed/my - return feed relevant to the authenticated user */
router.get('/my', requireAuth_1.default, async (req, res, next) => {
    try {
        const user = req.user;
        const events = await FeedEvent_1.default.find({ $or: [{ 'meta.user': user._id }, { type: 'announcement' }] }).sort({ createdAt: -1 }).limit(50).lean().exec();
        return res.json({ events });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=feed.js.map