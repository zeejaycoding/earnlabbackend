/**
 * Chat Routes
 * 
 * REST API endpoints for public chat functionality.
 * Works on serverless platforms like Vercel that don't support WebSockets.
 * 
 * Endpoints:
 * - GET /api/v1/chat/messages?room=xxx - Fetch messages for a room
 * - GET /api/v1/chat/online - Get online user count
 * - POST /api/v1/chat/messages - Send a message (requires auth)
 */

import { Router, Request, Response } from "express";
import mongoose, { Document, Schema, Model } from "mongoose";
import jwt from "jsonwebtoken";
import SystemSettings from "../models/SystemSettings";
import { calculateActivityProgress } from "../utils/activityProgression";

const router = Router();

// --- Types ---
interface IChatMessage extends Document {
  text: string;
  userId: mongoose.Types.ObjectId;
  username: string;
  avatar?: string;
  countryCode?: string;
  role: "user" | "admin" | "moderator";
  room: string;
  activityLevel?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface IOnlineUser extends Document {
  odId: string;
  odLastSeen: Date;
}

// --- Chat Message Schema ---
const ChatMessageSchema = new Schema<IChatMessage>(
  {
    text: { type: String, required: true, maxlength: 1000 },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, required: true },
    avatar: { type: String },
    countryCode: { type: String },
    role: { type: String, enum: ["user", "admin", "moderator"], default: "user" },
    room: { type: String, required: true, index: true, default: "general" },
    activityLevel: { type: String, required: false, default: "Beginner" },
  },
  { timestamps: true }
);

// Index for efficient queries
ChatMessageSchema.index({ room: 1, createdAt: -1 });

const ChatMessage: Model<IChatMessage> =
  mongoose.models.ChatMessage || mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);

// --- Online Tracking Schema (simple heartbeat-based) ---
const OnlineUserSchema = new Schema<IOnlineUser>(
  {
    odId: { type: String, required: true, unique: true },
    odLastSeen: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// TTL index - auto-delete after 2 minutes of inactivity
OnlineUserSchema.index({ odLastSeen: 1 }, { expireAfterSeconds: 120 });

const OnlineUser: Model<IOnlineUser> =
  mongoose.models.OnlineUser || mongoose.model<IOnlineUser>("OnlineUser", OnlineUserSchema);

// --- Auth Middleware ---
interface AuthRequest extends Request {
  user?: {
    _id: string;
    email: string;
    username: string;
    role?: string;
    avatar?: string;
    countryCode?: string;
    activityLevel?: string;
  };
}

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

// Get User model for auth
const getUserModel = () => {
  try {
    return mongoose.model("User");
  } catch {
    // User model not registered yet, return null
    return null;
  }
};

const authMiddleware = async (req: AuthRequest, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Get user from database to ensure they exist and get latest info
    const User = getUserModel();
    if (User) {
      const user = await User.findById(
        decoded.sub || decoded.userId || decoded.id || decoded._id,
      ).lean();
      if (user) {
        const u = user as any;
        // Use displayName first, then username, then email prefix as fallback
        const displayName = u.displayName || u.username || u.name || u.email?.split('@')[0] || "User";
        const settings = await SystemSettings.getSettings().catch(() => null);
        const progression = calculateActivityProgress(
          Number(u.activityScore || 0),
          (settings as any)?.activityLevelThresholds,
        );
        
        req.user = {
          _id: u._id.toString(),
          email: u.email,
          username: displayName,
          role: u.role || "user",
          avatar: u.avatarUrl || u.avatar,
          countryCode: u.countryCode || u.country,
          activityLevel: progression.currentLevel,
        };
        console.log("[Chat Auth] User from DB:", { id: req.user._id, username: req.user.username, email: req.user.email });
        return next();
      }
    }
    
    // Fallback to token data
    const displayName = decoded.displayName || decoded.username || decoded.name || decoded.email?.split('@')[0] || "User";
    req.user = {
      _id: decoded.userId || decoded.id || decoded._id,
      email: decoded.email,
      username: displayName,
      role: decoded.role || "user",
      avatar: decoded.avatar,
      countryCode: decoded.countryCode,
      activityLevel: "Beginner",
    };
    console.log("[Chat Auth] User from token:", { id: req.user._id, username: req.user.username });
    next();
  } catch (err) {
    console.error("Chat auth error:", err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// --- Routes ---

/**
 * GET /api/v1/chat/messages
 * Fetch messages for a specific room
 */
router.get("/messages", async (req: Request, res: Response) => {
  try {
    const room = (req.query.room as string) || "general";
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const before = req.query.before as string; // cursor for pagination

    const query: any = { room };
    if (before) {
      query._id = { $lt: new mongoose.Types.ObjectId(before) };
    }

    const messages = await ChatMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Return in chronological order (oldest first)
    res.json({
      messages: messages.reverse().map((m) => ({
        _id: m._id,
        id: m._id,
        text: m.text,
        userId: m.userId,
        username: m.username,
        avatar: m.avatar,
        countryCode: m.countryCode,
        role: m.role,
        room: m.room,
        activityLevel: (m as any).activityLevel || "Beginner",
        timestamp: m.createdAt,
      })),
      hasMore: messages.length === limit,
    });
  } catch (err) {
    console.error("Fetch messages error:", err);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

/**
 * POST /api/v1/chat/messages
 * Send a new message (requires authentication)
 */
router.post("/messages", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { text, room = "general" } = req.body;

    if (!text || typeof text !== "string") {
      return res.status(400).json({ message: "Message text is required" });
    }

    if (text.length > 1000) {
      return res.status(400).json({ message: "Message too long (max 1000 characters)" });
    }

    const validRooms = ["general", "trading", "help", "offtopic"];
    if (!validRooms.includes(room)) {
      return res.status(400).json({ message: "Invalid room" });
    }

    // Convert userId string to ObjectId
    let userIdObj: mongoose.Types.ObjectId;
    try {
      userIdObj = new mongoose.Types.ObjectId(req.user!._id);
    } catch (e) {
      console.error("Invalid user ID format:", req.user!._id);
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const message = await ChatMessage.create({
      text: text.trim(),
      userId: userIdObj,
      username: req.user!.username,
      avatar: req.user!.avatar,
      countryCode: req.user!.countryCode,
      role: req.user!.role || "user",
      room,
      activityLevel: req.user!.activityLevel || "Beginner",
    });

    const responseMessage = {
      _id: message._id,
      id: message._id,
      text: message.text,
      userId: message.userId,
      username: message.username,
      avatar: message.avatar,
      countryCode: message.countryCode,
      role: message.role,
      room: message.room,
      activityLevel: (message as any).activityLevel || "Beginner",
      timestamp: message.createdAt,
    };

    res.status(201).json({ message: responseMessage });
  } catch (err: any) {
    console.error("Send message error:", err);
    console.error("Error details:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
      user: req.user,
    });
    res.status(500).json({ message: "Failed to send message", error: err.message });
  }
});

/**
 * GET /api/v1/chat/online
 * Get approximate count of online users
 */
router.get("/online", async (_req: Request, res: Response) => {
  try {
    // Count users seen in the last 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const count = await OnlineUser.countDocuments({ odLastSeen: { $gte: twoMinutesAgo } });
    
    // Add a baseline to make it look more active
    res.json({ count: Math.max(count, 1) + 1 });
  } catch (err) {
    console.error("Online count error:", err);
    // Return a default count on error
    res.json({ count: 2 });
  }
});

/**
 * POST /api/v1/chat/heartbeat
 * Update user's online status (for polling-based online tracking)
 */
router.post("/heartbeat", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await OnlineUser.findOneAndUpdate(
      { odId: req.user!._id },
      { odId: req.user!._id, odLastSeen: new Date() },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Heartbeat error:", err);
    res.json({ ok: false });
  }
});

/**
 * GET /api/v1/chat/rooms
 * Get available chat rooms
 */
router.get("/rooms", (_req: Request, res: Response) => {
  res.json({
    rooms: [
      { id: "general", name: "General" },
      { id: "trading", name: "Trading" },
      { id: "help", name: "Help" },
      { id: "offtopic", name: "Off-Topic" },
    ],
  });
});

export default router;
