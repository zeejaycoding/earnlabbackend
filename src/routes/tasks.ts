import { Router, Request, Response, NextFunction } from "express";
import { body, param, query, validationResult } from "express-validator";
import mongoose from "mongoose";
import requireAuth from "../utils/requireAuth";
import Task, { ITask } from "../models/Task";
import User from "../models/User";
import Notification from "../models/Notification";
import FeedEvent from "../models/FeedEvent";
import SystemSettings from "../models/SystemSettings";
import { applyActivityEvent } from "../utils/activityProgression";

const router = Router();

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
router.get(
  "/",
  query("type").optional().isString(),
  query("status").optional().isString(),
    query("offerwallId").optional().isString(),
    query("offerwall").optional().isString(),
  query("mine").optional().isBoolean().toBoolean(),
  query("limit").optional().toInt(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(422).json({ errors: errors.array() });

      const { type, status, offerwallId, offerwall } = req.query as any;
      const mine = String(req.query.mine).toLowerCase() === "true";
      const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 500);

      const filter: any = {};
      if (type) filter.type = String(type);
      if (status) filter.status = String(status);
      if (offerwallId) {
        const wallId = String(offerwallId);
        filter.$or = [
          { "metadata.offerwallId": wallId },
          { "metadata.providerId": wallId },
          { "metadata.offerwall._id": wallId },
        ];
      } else if (offerwall) {
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
              message:
                "Use /api/v1/user/tasks to fetch your tasks (authenticated endpoint)",
            });
        } catch {
          return res.status(401).json({ message: "Invalid token" });
        }
      }

      const tasks = await Task.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec();
      return res.json({ tasks });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/tasks/:id
 */
router.get(
  "/:id",
  param("id").isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id))
        return res.status(400).json({ message: "Invalid task id" });

      const task = await Task.findById(id).lean().exec();
      if (!task) return res.status(404).json({ message: "Task not found" });

      return res.json({ task });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/tasks
 * Create a new task (admin-use in production).
 * Body: { title, description?, type?, rewardCents?, availableFrom?, expiresAt?, metadata? }
 *
 * Requires authentication to create (current simple policy).
 */
router.post(
  "/",
  requireAuth,
  body("title").isString().trim().isLength({ min: 3 }),
  body("description").optional().isString(),
  body("type").optional().isString(),
  body("rewardCents").optional().isInt({ min: 0 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(422).json({ errors: errors.array() });

      const {
        title,
        description,
        type,
        rewardCents,
        availableFrom,
        expiresAt,
        metadata,
      } = req.body as any;
      const doc: any = {
        title: String(title).trim(),
        description: description || null,
        type: type || "one-time",
        rewardCents: typeof rewardCents === "number" ? rewardCents : 0,
        metadata: metadata || null,
      };
      if (availableFrom) doc.availableFrom = new Date(availableFrom);
      if (expiresAt) doc.expiresAt = new Date(expiresAt);

      const created = await Task.create(doc);
      return res.status(201).json({ task: created });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /api/v1/tasks/:id
 * Update fields on a task.
 */
router.put(
  "/:id",
  requireAuth,
  param("id").isString(),
  body("title").optional().isString().trim().isLength({ min: 3 }),
  body("description").optional().isString(),
  body("type").optional().isString(),
  body("rewardCents").optional().isInt({ min: 0 }),
  body("status").optional().isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id))
        return res.status(400).json({ message: "Invalid task id" });

      const updates: any = {};
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
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      });
      if (updates.availableFrom)
        updates.availableFrom = new Date(updates.availableFrom);
      if (updates.expiresAt) updates.expiresAt = new Date(updates.expiresAt);

      const task = await Task.findByIdAndUpdate(id, updates, {
        new: true,
      }).exec();
      if (!task) return res.status(404).json({ message: "Task not found" });

      return res.json({ task });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/tasks/:id
 */
router.delete(
  "/:id",
  requireAuth,
  param("id").isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id))
        return res.status(400).json({ message: "Invalid task id" });

      const task = await Task.findByIdAndDelete(id).exec();
      if (!task) return res.status(404).json({ message: "Task not found" });

      return res.json({ message: "Task deleted", taskId: id });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/tasks/:id/claim
 * Claim a task for the authenticated user.
 * Uses an atomic findOneAndUpdate to avoid race conditions.
 */
router.post(
  "/:id/claim",
  requireAuth,
  param("id").isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const user = (req as any).user as any;

      if (!mongoose.Types.ObjectId.isValid(id))
        return res.status(400).json({ message: "Invalid task id" });

      const now = new Date();
      // Only claim if status is available and time windows allow
      const filter: any = {
        _id: id,
        status: "available",
        $and: [
          { $or: [{ availableFrom: null }, { availableFrom: { $lte: now } }] },
          { $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] },
        ],
      };
      const update: any = {
        $set: { status: "in_progress", user: user._id, progressPercent: 0 },
      };

      const claimed = await Task.findOneAndUpdate(filter, update, {
        new: true,
      }).exec();
      if (!claimed) {
        return res
          .status(409)
          .json({
            message:
              "Task not available to claim (may be claimed by another user or expired)",
          });
      }

      // Optionally create a notification for the user
      try {
        const notif = await Notification.create({
          user: user._id,
          type: "task.claimed",
          title: "Task claimed",
          body: `You have claimed task: ${claimed.title}`,
          read: false,
        });

        // emit via socket.io if available
        const io = (req.app as any).locals?.io;
        if (io && notif) {
          io.to(`user:${user._id}`).emit("notification", notif);
        }
      } catch {
        // non-fatal
      }

      return res.json({ message: "Task claimed", task: claimed });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/tasks/:id/complete
 * Mark task as completed by user and credit reward to user balance (idempotent if already completed).
 * Body optional: { earnedCents?: number } to override reward (admin).
 *
 * Basic concurrency and idempotency:
 *  - Only the assigned user (task.user) can complete the task (or if task had no user, allow any authenticated caller)
 *  - If task.status === 'completed' return success but do not double-credit
 */
router.post(
  "/:id/complete",
  requireAuth,
  param("id").isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const user = (req as any).user as any;
      if (!mongoose.Types.ObjectId.isValid(id))
        return res.status(400).json({ message: "Invalid task id" });

      const taskDoc = await Task.findById(id).exec();
      if (!taskDoc) return res.status(404).json({ message: "Task not found" });

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
      const reward =
        typeof req.body.earnedCents === "number"
          ? Math.max(0, Math.round(req.body.earnedCents))
          : taskDoc.rewardCents || 0;

      const settings = await SystemSettings.getSettings().catch(() => null);
      const normalizedTaskType = String(taskDoc.type || "").toLowerCase();
      const activityEventType = normalizedTaskType.includes("survey")
        ? "survey_completion"
        : "offer_completion";

      // Use a transaction-like sequence (mongoose with single-document updates)
      const session = await mongoose.startSession();
      try {
        session.startTransaction();
        // mark task completed
        await taskDoc.save({ session });

        // credit user
        const dbUser = await User.findById(user._id).session(session).exec();
        if (!dbUser) {
          await session.abortTransaction();
          session.endSession();
          return res
            .status(500)
            .json({ message: "User not found while crediting reward" });
        }
        dbUser.balanceCents = (dbUser.balanceCents || 0) + reward;

        applyActivityEvent(dbUser as any, activityEventType, {
          scoreConfig: (settings as any)?.activityScoreConfig,
        });

        await dbUser.save({ session });

        // create feed event and notification
        const createdFeed = await FeedEvent.create(
          [
            {
              type: "earning",
              text: `${dbUser.username || "A user"} earned $${(reward / 100).toFixed(2)} from task: ${taskDoc.title}`,
              amountCents: reward,
            },
          ],
          { session },
        );
        const createdNotifs = await Notification.create(
          [
            {
              user: dbUser._id,
              type: "task.completed",
              title: "Task completed",
              body: `You've earned $${(reward / 100).toFixed(2)} for "${taskDoc.title}"`,
              read: false,
            },
          ],
          { session },
        );

        // after committing, emit realtime messages (we will emit regardless but it's fine)
        // try to get io from req.app
        try {
          const io = (req.app as any).locals?.io;
          if (io) {
            // feed events: broadcast to everyone
            if (Array.isArray(createdFeed) && createdFeed.length > 0) {
              createdFeed.forEach((f: any) => io.emit("feed:event", f));
            }
            // notifications: send to the user room
            if (Array.isArray(createdNotifs) && createdNotifs.length > 0) {
              createdNotifs.forEach((n: any) => io.to(`user:${dbUser._id}`).emit("notification", n));
            }
          }
        } catch (e) {
          // non-fatal
        }

        await session.commitTransaction();
        session.endSession();
      } catch (txErr) {
        await session.abortTransaction();
        session.endSession();
        throw txErr;
      }

      return res.json({
        message: "Task completed and reward credited",
        rewardCents: reward,
        task: taskDoc,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/tasks/my
 * Returns tasks assigned to authenticated user
 */
router.get(
  "/my",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const tasks = await Task.find({ user: user._id })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
      return res.json({ tasks });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
