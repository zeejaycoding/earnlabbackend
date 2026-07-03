"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const requireAuth_1 = __importDefault(require("../utils/requireAuth"));
const Notification_1 = __importDefault(require("../models/Notification"));
const router = (0, express_1.Router)();
/** GET /api/v1/user/notifications */
router.get('/', requireAuth_1.default, async (req, res, next) => {
    try {
        const user = req.user;
        const notifications = await Notification_1.default.find({ user: user._id }).sort({ createdAt: -1 }).lean().exec();
        return res.json({ notifications });
    }
    catch (err) {
        next(err);
    }
});
/** POST /api/v1/user/notifications/read */
router.post('/read', requireAuth_1.default, async (req, res, next) => {
    try {
        const user = req.user;
        const ids = req.body.ids;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            // mark all as read
            await Notification_1.default.updateMany({ user: user._id, read: false }, { $set: { read: true } }).exec();
            // emit update to user socket room
            try {
                const io = req.app.locals?.io;
                if (io)
                    io.to(`user:${user._id}`).emit('notifications:read', { all: true });
            }
            catch { }
            return res.json({ message: 'All notifications marked read' });
        }
        await Notification_1.default.updateMany({ user: user._id, _id: { $in: ids } }, { $set: { read: true } }).exec();
        try {
            const io = req.app.locals?.io;
            if (io)
                io.to(`user:${user._id}`).emit('notifications:read', { ids });
        }
        catch { }
        return res.json({ message: 'Selected notifications marked read', count: ids.length });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=notifications.js.map