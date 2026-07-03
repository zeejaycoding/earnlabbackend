import { Router, Request, Response, NextFunction } from "express";
import { body, validationResult, query, param } from "express-validator";
import mongoose, { Schema, Document, Model } from "mongoose";
import requireAuth from "../utils/requireAuth";

const router = Router();

/**
 * Lightweight support models defined locally.
 *
 * - ContactMessage: stores messages from non-authenticated or authenticated users
 * - ChatRoom: conversation container between a user and support agents
 * - ChatMessage: individual messages in a ChatRoom
 *
 * These are intentionally simple and suitable for a demo; in production you may want
 * to extract them into separate files, add indexes, pagination, and retention policies.
 */

/* -----------------------
   ContactMessage model
   ----------------------- */
export interface IContactMessage extends Document {
  name?: string | null;
  email?: string | null;
  user?: mongoose.Types.ObjectId | null;
  subject: string;
  message: string;
  handled: boolean;
  createdAt: Date;
}

const ContactMessageSchema = new Schema<IContactMessage>(
  {
    name: { type: String, required: false, default: null },
    email: { type: String, required: false, default: null },
    user: { type: Schema.Types.ObjectId, ref: "User", required: false, default: null, index: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    handled: { type: Boolean, required: true, default: false, index: true },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } },
);

const ContactMessage: Model<IContactMessage> =
  mongoose.models.ContactMessage || mongoose.model<IContactMessage>("ContactMessage", ContactMessageSchema);

/* -----------------------
   ChatRoom & ChatMessage
   ----------------------- */

export interface IChatMessage extends Document {
  room: mongoose.Types.ObjectId;
  senderUser?: mongoose.Types.ObjectId | null;
  senderRole: "user" | "support" | "system";
  text: string;
  meta?: Record<string, any> | null;
  createdAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    room: { type: Schema.Types.ObjectId, ref: "ChatRoom", required: true, index: true },
    senderUser: { type: Schema.Types.ObjectId, ref: "User", required: false, default: null },
    senderRole: { type: String, required: true, enum: ["user", "support", "system"], default: "user" },
    text: { type: String, required: true },
    meta: { type: Schema.Types.Mixed, required: false, default: null },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } },
);

const ChatMessage: Model<IChatMessage> =
  mongoose.models.ChatMessage || mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);

export interface IChatRoom extends Document {
  participants: mongoose.Types.ObjectId[]; // typically [userId, supportAgentId?]
  subject?: string | null;
  status: "open" | "closed" | "archived";
  lastMessageAt?: Date | null;
  createdAt: Date;
}

const ChatRoomSchema = new Schema<IChatRoom>(
  {
    participants: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], required: true, index: true },
    subject: { type: String, required: false, default: null },
    status: { type: String, required: true, default: "open", enum: ["open", "closed", "archived"], index: true },
    lastMessageAt: { type: Date, required: false, default: null },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } },
);

const ChatRoom: Model<IChatRoom> =
  mongoose.models.ChatRoom || mongoose.model<IChatRoom>("ChatRoom", ChatRoomSchema);

/* -----------------------
   Routes
   ----------------------- */

/**
 * POST /api/v1/support/contact
 * Public contact form (authenticated or anonymous)
 * Body: { name?, email?, subject, message }
 */
router.post(
  "/contact",
  body("name").optional().isString().trim().isLength({ min: 1, max: 200 }),
  body("email").optional().isEmail().normalizeEmail(),
  body("subject").isString().trim().isLength({ min: 3, max: 200 }),
  body("message").isString().trim().isLength({ min: 3, max: 5000 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

      const { name, email, subject, message } = req.body as {
        name?: string;
        email?: string;
        subject: string;
        message: string;
      };

      // If auth present, try to attach user id (non-blocking)
      let userId: mongoose.Types.ObjectId | null = null;
      try {
        // Note: We intentionally don't invoke requireAuth middleware here to keep
        // the endpoint usable by anonymous users. Instead we attempt to read the
        // Authorization header and verify token if present.
        const auth = req.header("authorization");
        if (auth && auth.startsWith("Bearer ")) {
          const jwt = require("jsonwebtoken");
          const secret = process.env.JWT_SECRET || "please-change-this-secret";
          try {
            const payload: any = jwt.verify(auth.slice(7).trim(), secret);
            if (payload && payload.sub && mongoose.Types.ObjectId.isValid(payload.sub)) {
              userId = new mongoose.Types.ObjectId(payload.sub);
            }
          } catch {
            // ignore token errors — treat as anonymous
          }
        }
      } catch {
        // noop
      }

      const saved = await ContactMessage.create({
        name: name || null,
        email: email || null,
        user: userId,
        subject,
        message,
        handled: false,
      });

      // In production you'd enqueue an email/notification to support staff here.
      // For demo return the created record id and a friendly message.
      return res.status(201).json({
        message: "Contact message received",
        contactId: saved._id,
        createdAt: saved.createdAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/support/chat
 * Returns list of chat rooms for the authenticated user.
 * Query: ?limit=20&before=<ISO date or message id> (simple)
 */
router.get(
  "/chat",
  requireAuth,
  query("limit").optional().toInt(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);

      const rooms = await ChatRoom.find({ participants: user._id })
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .limit(limit)
        .lean()
        .exec();

      return res.json({ rooms });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/support/chat/:roomId
 * Fetch messages for a chat room (authenticated user must be a participant)
 * Query params: ?limit=50
 */
router.get(
  "/chat/:roomId",
  requireAuth,
  param("roomId").isString(),
  query("limit").optional().toInt(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const { roomId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(roomId)) return res.status(400).json({ message: "Invalid roomId" });

      const room = await ChatRoom.findById(roomId).exec();
      if (!room) return res.status(404).json({ message: "Chat room not found" });

      // Ensure the requesting user is a participant
      const isParticipant = (room.participants || []).some((p) => p.toString() === user._id.toString());
      if (!isParticipant) return res.status(403).json({ message: "Access denied" });

      const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);

      const messages = await ChatMessage.find({ room: room._id })
        .sort({ createdAt: 1 })
        .limit(limit)
        .lean()
        .exec();

      return res.json({ room: { ...room.toObject() }, messages });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/support/chat
 * Send a message to support or create a new chat.
 * Body: { roomId?: string, text: string, subject?: string }
 */
router.post(
  "/chat",
  requireAuth,
  body("roomId").optional().isString(),
  body("text").isString().trim().isLength({ min: 1, max: 4000 }),
  body("subject").optional().isString().trim().isLength({ min: 3, max: 200 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

      const user = (req as any).user;
      const { roomId, text, subject } = req.body as { roomId?: string; text: string; subject?: string };

      let room: IChatRoom | null = null;

      if (roomId) {
        if (!mongoose.Types.ObjectId.isValid(roomId)) return res.status(400).json({ message: "Invalid roomId" });
        room = (await ChatRoom.findById(roomId).exec()) as IChatRoom | null;
        if (!room) return res.status(404).json({ message: "Chat room not found" });
        const isParticipant = (room.participants || []).some((p) => p.toString() === user._id.toString());
        if (!isParticipant) return res.status(403).json({ message: "Not a participant in this chat" });
      } else {
        // Create new chat room with the user as a participant.
        room = await ChatRoom.create({
          participants: [user._id],
          subject: subject || null,
          status: "open",
          lastMessageAt: new Date(),
        } as any);
      }

      // create message
      const msg = await ChatMessage.create({
        room: room._id,
        senderUser: user._id,
        senderRole: "user",
        text,
        meta: null,
      } as any);

      // update room lastMessageAt and ensure user is in participants
      const participantIds = new Set((room.participants || []).map((p) => p.toString()));
      participantIds.add(user._id.toString());
      room.participants = Array.from(participantIds).map((id) => new mongoose.Types.ObjectId(id));
      room.lastMessageAt = msg.createdAt as any;
      await room.save();

      // In production you'd notify support agents / push socket events here.
      return res.status(201).json({ message: "Message sent", roomId: room._id, messageId: msg._id, sentAt: msg.createdAt });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/support/chat/:roomId/close
 * Close a chat room (user or support can close). Auth required and must be participant.
 */
router.post(
  "/chat/:roomId/close",
  requireAuth,
  param("roomId").isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const { roomId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(roomId)) return res.status(400).json({ message: "Invalid roomId" });

      const room = await ChatRoom.findById(roomId).exec();
      if (!room) return res.status(404).json({ message: "Chat room not found" });

      const isParticipant = (room.participants || []).some((p) => p.toString() === user._id.toString());
      if (!isParticipant) return res.status(403).json({ message: "Not a participant" });

      room.status = "closed";
      await room.save();

      // Optionally create a system message
      await ChatMessage.create({
        room: room._id,
        senderUser: null,
        senderRole: "system",
        text: "Chat closed by user",
      } as any);

      return res.json({ message: "Chat closed", roomId: room._id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
