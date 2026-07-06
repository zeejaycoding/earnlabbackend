"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const mongoose_1 = __importDefault(require("mongoose"));
const requireAuth_1 = __importDefault(require("../utils/requireAuth"));
const Task_1 = __importDefault(require("../models/Task"));
const User_1 = __importDefault(require("../models/User"));
const Notification_1 = __importDefault(require("../models/Notification"));
const FeedEvent_1 = __importDefault(require("../models/FeedEvent"));
const OfferLog_1 = __importDefault(require("../models/OfferLog"));
const SystemSettings_1 = __importDefault(require("../models/SystemSettings"));
const activityProgression_1 = require("../utils/activityProgression");
const rewardHoldService_1 = require("../services/rewardHoldService");
const router = (0, express_1.Router)();
/**
 * GET /api/v1/tasks
 * Query:
 *   - type (optional)
 *   - status (optional: available|in_progress|completed|failed)
 *   - mine (optional boolean) => if true, returns tasks assigned to the authenticated user (requires auth)
 *   - limit (optional)
 *
 * If `mine=true` the route requires authentication.
 */
router.get("/", (0, express_validator_1.query)("type").optional().isString(), (0, express_validator_1.query)("status").optional().isString(), (0, express_validator_1.query)("offerwallId").optional().isString(), (0, express_validator_1.query)("offerwall").optional().isString(), (0, express_validator_1.query)("mine").optional().isBoolean().toBoolean(), (0, express_validator_1.query)("limit").optional().toInt(), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty())
            return res.status(422).json({ errors: errors.array() });
        const { type, status, offerwallId, offerwall } = req.query;
        const mine = String(req.query.mine).toLowerCase() === "true";
        const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 500);
        const filter = {};
        if (type)
            filter.type = String(type);
        if (status)
            filter.status = String(status);
        if (offerwallId) {
            const wallId = String(offerwallId);
            filter.$or = [
                { "metadata.offerwallId": wallId },
                { "metadata.providerId": wallId },
                { "metadata.offerwall._id": wallId },
            ];
        }
        else if (offerwall) {
            const wallName = String(offerwall);
            filter.$or = [
                { "metadata.offerwall": wallName },
                { "metadata.provider": wallName },
                { "metadata.offerwallName": wallName },
            ];
        }
        if (mine) {
            // require auth
            const authHeader = req.header("authorization");
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                return res
                    .status(401)
                    .json({ message: "Authentication required for 'mine' query" });
            }
            // reuse requireAuth middleware behavior inline (lightweight)
            try {
                // We can attempt to get user id from token by leveraging requireAuth's behavior.
                // Simpler: call requireAuth explicitly by wrapping it, but here we expect it has been applied by caller when mounting.
                // If not mounted with auth, ask client to call /api/v1/user/tasks (the existing endpoint) instead.
                return res
                    .status(400)
                    .json({
                    message: "Use /api/v1/user/tasks to fetch your tasks (authenticated endpoint)",
                });
            }
            catch {
                return res.status(401).json({ message: "Invalid token" });
            }
        }
        const tasks = await Task_1.default.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean()
            .exec();
        return res.json({ tasks });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/tasks/:id
 */
router.get("/:id", (0, express_validator_1.param)("id").isString(), async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "Invalid task id" });
        const task = await Task_1.default.findById(id).lean().exec();
        if (!task)
            return res.status(404).json({ message: "Task not found" });
        return res.json({ task });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/tasks
 * Create a new task (admin-use in production).
 * Body: { title, description?, type?, rewardCents?, availableFrom?, expiresAt?, metadata? }
 *
 * Requires authentication to create (current simple policy).
 */
router.post("/", requireAuth_1.default, (0, express_validator_1.body)("title").isString().trim().isLength({ min: 3 }), (0, express_validator_1.body)("description").optional().isString(), (0, express_validator_1.body)("type").optional().isString(), (0, express_validator_1.body)("rewardCents").optional().isInt({ min: 0 }), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty())
            return res.status(422).json({ errors: errors.array() });
        const { title, description, type, rewardCents, availableFrom, expiresAt, metadata, } = req.body;
        const doc = {
            title: String(title).trim(),
            description: description || null,
            type: type || "one-time",
            rewardCents: typeof rewardCents === "number" ? rewardCents : 0,
            metadata: metadata || null,
        };
        if (availableFrom)
            doc.availableFrom = new Date(availableFrom);
        if (expiresAt)
            doc.expiresAt = new Date(expiresAt);
        const created = await Task_1.default.create(doc);
        return res.status(201).json({ task: created });
    }
    catch (err) {
        next(err);
    }
});
/**
 * PUT /api/v1/tasks/:id
 * Update fields on a task.
 */
router.put("/:id", requireAuth_1.default, (0, express_validator_1.param)("id").isString(), (0, express_validator_1.body)("title").optional().isString().trim().isLength({ min: 3 }), (0, express_validator_1.body)("description").optional().isString(), (0, express_validator_1.body)("type").optional().isString(), (0, express_validator_1.body)("rewardCents").optional().isInt({ min: 0 }), (0, express_validator_1.body)("status").optional().isString(), async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "Invalid task id" });
        const updates = {};
        [
            "title",
            "description",
            "type",
            "rewardCents",
            "status",
            "availableFrom",
            "expiresAt",
            "metadata",
        ].forEach((k) => {
            if (req.body[k] !== undefined)
                updates[k] = req.body[k];
        });
        if (updates.availableFrom)
            updates.availableFrom = new Date(updates.availableFrom);
        if (updates.expiresAt)
            updates.expiresAt = new Date(updates.expiresAt);
        const task = await Task_1.default.findByIdAndUpdate(id, updates, {
            new: true,
        }).exec();
        if (!task)
            return res.status(404).json({ message: "Task not found" });
        return res.json({ task });
    }
    catch (err) {
        next(err);
    }
});
/**
 * DELETE /api/v1/tasks/:id
 */
router.delete("/:id", requireAuth_1.default, (0, express_validator_1.param)("id").isString(), async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "Invalid task id" });
        const task = await Task_1.default.findByIdAndDelete(id).exec();
        if (!task)
            return res.status(404).json({ message: "Task not found" });
        return res.json({ message: "Task deleted", taskId: id });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/tasks/:id/claim
 * Claim a task for the authenticated user.
 * Uses an atomic findOneAndUpdate to avoid race conditions.
 */
router.post("/:id/claim", requireAuth_1.default, (0, express_validator_1.param)("id").isString(), async (req, res, next) => {
    try {
        const { id } = req.params;
        const user = req.user;
        if (!mongoose_1.default.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "Invalid task id" });
        const now = new Date();
        // Only claim if status is available and time windows allow
        const filter = {
            _id: id,
            status: "available",
            $and: [
                { $or: [{ availableFrom: null }, { availableFrom: { $lte: now } }] },
                { $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] },
            ],
        };
        const update = {
            $set: { status: "in_progress", user: user._id, progressPercent: 0 },
        };
        const claimed = await Task_1.default.findOneAndUpdate(filter, update, {
            new: true,
        }).exec();
        if (!claimed) {
            return res
                .status(409)
                .json({
                message: "Task not available to claim (may be claimed by another user or expired)",
            });
        }
        // Optionally create a notification for the user
        try {
            const notif = await Notification_1.default.create({
                user: user._id,
                type: "task.claimed",
                title: "Task claimed",
                body: `You have claimed task: ${claimed.title}`,
                read: false,
            });
            // emit via socket.io if available
            const io = req.app.locals?.io;
            if (io && notif) {
                io.to(`user:${user._id}`).emit("notification", notif);
            }
        }
        catch {
            // non-fatal
        }
        return res.json({ message: "Task claimed", task: claimed });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/tasks/:id/complete
 * Mark task as completed by user and credit reward to user balance (idempotent if already completed).
 * Body optional: { earnedCents?: number } to override reward (admin).
 *
 * Basic concurrency and idempotency:
 *  - Only the assigned user (task.user) can complete the task (or if task had no user, allow any authenticated caller)
 *  - If task.status === 'completed' return success but do not double-credit
 */
router.post("/:id/complete", requireAuth_1.default, (0, express_validator_1.param)("id").isString(), async (req, res, next) => {
    try {
        const { id } = req.params;
        const user = req.user;
        if (!mongoose_1.default.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "Invalid task id" });
        const taskDoc = await Task_1.default.findById(id).exec();
        if (!taskDoc)
            return res.status(404).json({ message: "Task not found" });
        // Authorization: must be assigned user or unassigned
        if (taskDoc.user && taskDoc.user.toString() !== user._id.toString()) {
            return res
                .status(403)
                .json({ message: "Not authorized to complete this task" });
        }
        // Idempotency: if already completed, return current state
        if (taskDoc.status === "completed") {
            return res.json({ message: "Task already completed", task: taskDoc });
        }
        // Complete the task (update doc)
        taskDoc.status = "completed";
        taskDoc.progressPercent = 100;
        taskDoc.completedAt = new Date();
        // credit user's balance
        const reward = typeof req.body.earnedCents === "number"
            ? Math.max(0, Math.round(req.body.earnedCents))
            : taskDoc.rewardCents || 0;
        const settings = await SystemSettings_1.default.getSettings().catch(() => null);
        const normalizedTaskType = String(taskDoc.type || "").toLowerCase();
        const activityEventType = normalizedTaskType.includes("survey")
            ? "survey_completion"
            : "offer_completion";
        // Use a transaction-like sequence (mongoose with single-document updates)
        const session = await mongoose_1.default.startSession();
        try {
            session.startTransaction();
            // mark task completed
            await taskDoc.save({ session });
            // credit user (pending balance – hold period applies)
            const dbUser = await User_1.default.findById(user._id).session(session).exec();
            if (!dbUser) {
                await session.abortTransaction();
                session.endSession();
                return res
                    .status(500)
                    .json({ message: "User not found while crediting reward" });
            }
            dbUser.pendingBalanceCents = (dbUser.pendingBalanceCents || 0) + reward;
            (0, activityProgression_1.applyActivityEvent)(dbUser, activityEventType, {
                scoreConfig: settings?.activityScoreConfig,
            });
            await dbUser.save({ session });
            // create OfferLog with hold status to track the hold period
            const holdDays = await (0, rewardHoldService_1.getHoldTimeDaysForUser)(dbUser._id.toString());
            const holdUntil = (0, rewardHoldService_1.calculateHoldUntil)(holdDays);
            await OfferLog_1.default.create([
                {
                    user: dbUser._id,
                    offerId: taskDoc._id.toString(),
                    provider: "task",
                    offerName: taskDoc.title || "Task",
                    amountCents: reward,
                    status: "held",
                    holdUntil,
                },
            ], { session });
            // create feed event and notification
            const createdFeed = await FeedEvent_1.default.create([
                {
                    type: "earning",
                    text: `${dbUser.username || "A user"} earned $${(reward / 100).toFixed(2)} from task: ${taskDoc.title}`,
                    amountCents: reward,
                },
            ], { session });
            const createdNotifs = await Notification_1.default.create([
                {
                    user: dbUser._id,
                    type: "task.completed",
                    title: "Task completed",
                    body: `You've earned $${(reward / 100).toFixed(2)} for "${taskDoc.title}"`,
                    read: false,
                },
            ], { session });
            // after committing, emit realtime messages (we will emit regardless but it's fine)
            // try to get io from req.app
            try {
                const io = req.app.locals?.io;
                if (io) {
                    // feed events: broadcast to everyone
                    if (Array.isArray(createdFeed) && createdFeed.length > 0) {
                        createdFeed.forEach((f) => io.emit("feed:event", f));
                    }
                    // notifications: send to the user room
                    if (Array.isArray(createdNotifs) && createdNotifs.length > 0) {
                        createdNotifs.forEach((n) => io.to(`user:${dbUser._id}`).emit("notification", n));
                    }
                }
            }
            catch (e) {
                // non-fatal
            }
            await session.commitTransaction();
            session.endSession();
        }
        catch (txErr) {
            await session.abortTransaction();
            session.endSession();
            throw txErr;
        }
        return res.json({
            message: "Task completed and reward placed on hold",
            rewardCents: reward,
            pending: true,
            task: taskDoc,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/tasks/my
 * Returns tasks assigned to authenticated user
 */
router.get("/my", requireAuth_1.default, async (req, res, next) => {
    try {
        const user = req.user;
        const tasks = await Task_1.default.find({ user: user._id })
            .sort({ createdAt: -1 })
            .lean()
            .exec();
        return res.json({ tasks });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=tasks.js.map