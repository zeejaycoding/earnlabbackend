"use strict";
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
const express_1 = require("express");
const mongoose_1 = __importStar(require("mongoose"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const SystemSettings_1 = __importDefault(require("../models/SystemSettings"));
const activityProgression_1 = require("../utils/activityProgression");
const router = (0, express_1.Router)();
// --- Chat Message Schema ---
const ChatMessageSchema = new mongoose_1.Schema({
    text: { type: String, required: true, maxlength: 1000 },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, required: true },
    avatar: { type: String },
    countryCode: { type: String },
    role: { type: String, enum: ["user", "admin", "moderator"], default: "user" },
    room: { type: String, required: true, index: true, default: "general" },
    activityLevel: { type: String, required: false, default: "Beginner" },
}, { timestamps: true });
// Index for efficient queries
ChatMessageSchema.index({ room: 1, createdAt: -1 });
const ChatMessage = mongoose_1.default.models.ChatMessage || mongoose_1.default.model("ChatMessage", ChatMessageSchema);
// --- Online Tracking Schema (simple heartbeat-based) ---
const OnlineUserSchema = new mongoose_1.Schema({
    odId: { type: String, required: true, unique: true },
    odLastSeen: { type: Date, default: Date.now },
}, { timestamps: false });
// TTL index - auto-delete after 2 minutes of inactivity
OnlineUserSchema.index({ odLastSeen: 1 }, { expireAfterSeconds: 120 });
const OnlineUser = mongoose_1.default.models.OnlineUser || mongoose_1.default.model("OnlineUser", OnlineUserSchema);
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
// Get User model for auth
const getUserModel = () => {
    try {
        return mongoose_1.default.model("User");
    }
    catch {
        // User model not registered yet, return null
        return null;
    }
};
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Authentication required" });
    }
    const token = authHeader.substring(7);
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        // Get user from database to ensure they exist and get latest info
        const User = getUserModel();
        if (User) {
            const user = await User.findById(decoded.sub || decoded.userId || decoded.id || decoded._id).lean();
            if (user) {
                const u = user;
                // Use displayName first, then username, then email prefix as fallback
                const displayName = u.displayName || u.username || u.name || u.email?.split('@')[0] || "User";
                const settings = await SystemSettings_1.default.getSettings().catch(() => null);
                const progression = (0, activityProgression_1.calculateActivityProgress)(Number(u.activityScore || 0), settings?.activityLevelThresholds);
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
    }
    catch (err) {
        console.error("Chat auth error:", err);
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};
// --- Routes ---
/**
 * GET /api/v1/chat/messages
 * Fetch messages for a specific room
 */
router.get("/messages", async (req, res) => {
    try {
        const room = req.query.room || "general";
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const before = req.query.before; // cursor for pagination
        const query = { room };
        if (before) {
            query._id = { $lt: new mongoose_1.default.Types.ObjectId(before) };
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
                activityLevel: m.activityLevel || "Beginner",
                timestamp: m.createdAt,
            })),
            hasMore: messages.length === limit,
        });
    }
    catch (err) {
        console.error("Fetch messages error:", err);
        res.status(500).json({ message: "Failed to fetch messages" });
    }
});
/**
 * POST /api/v1/chat/messages
 * Send a new message (requires authentication)
 */
router.post("/messages", authMiddleware, async (req, res) => {
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
        let userIdObj;
        try {
            userIdObj = new mongoose_1.default.Types.ObjectId(req.user._id);
        }
        catch (e) {
            console.error("Invalid user ID format:", req.user._id);
            return res.status(400).json({ message: "Invalid user ID" });
        }
        const message = await ChatMessage.create({
            text: text.trim(),
            userId: userIdObj,
            username: req.user.username,
            avatar: req.user.avatar,
            countryCode: req.user.countryCode,
            role: req.user.role || "user",
            room,
            activityLevel: req.user.activityLevel || "Beginner",
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
            activityLevel: message.activityLevel || "Beginner",
            timestamp: message.createdAt,
        };
        res.status(201).json({ message: responseMessage });
    }
    catch (err) {
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
router.get("/online", async (_req, res) => {
    try {
        // Count users seen in the last 2 minutes
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        const count = await OnlineUser.countDocuments({ odLastSeen: { $gte: twoMinutesAgo } });
        // Add a baseline to make it look more active
        res.json({ count: Math.max(count, 1) + 1 });
    }
    catch (err) {
        console.error("Online count error:", err);
        // Return a default count on error
        res.json({ count: 2 });
    }
});
/**
 * POST /api/v1/chat/heartbeat
 * Update user's online status (for polling-based online tracking)
 */
router.post("/heartbeat", authMiddleware, async (req, res) => {
    try {
        await OnlineUser.findOneAndUpdate({ odId: req.user._id }, { odId: req.user._id, odLastSeen: new Date() }, { upsert: true });
        res.json({ ok: true });
    }
    catch (err) {
        console.error("Heartbeat error:", err);
        res.json({ ok: false });
    }
});
/**
 * GET /api/v1/chat/rooms
 * Get available chat rooms
 */
router.get("/rooms", (_req, res) => {
    res.json({
        rooms: [
            { id: "general", name: "General" },
            { id: "trading", name: "Trading" },
            { id: "help", name: "Help" },
            { id: "offtopic", name: "Off-Topic" },
        ],
    });
});
exports.default = router;
//# sourceMappingURL=chat.js.map