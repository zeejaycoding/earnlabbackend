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
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const mongoose_1 = __importStar(require("mongoose"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || "please-change-this-secret";
/**
 * Lenient auth middleware for support chat.
 * Tries DB user lookup first; falls back to decoding the token and creating
 * a minimal user object so support chat still works even on DB mismatches.
 */
const softAuth = async (req, res, next) => {
    const auth = req.header("authorization");
    if (!auth?.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Missing or invalid Authorization header" });
    }
    const token = auth.slice(7).trim();
    // Try DB lookup first
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const userId = decoded.sub || decoded.userId || decoded.id;
        if (userId) {
            const user = await User_1.default.findById(userId).exec();
            if (user) {
                req.user = user;
                req.authToken = token;
                return next();
            }
        }
    }
    catch {
        // DB lookup failed, fall through
    }
    // Fallback: build user from token data
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = {
            _id: decoded.sub || decoded.userId || decoded.id,
            email: decoded.email || "",
            username: decoded.displayName || decoded.username || decoded.email?.split("@")[0] || "User",
            role: decoded.role || "user",
        };
        req.authToken = token;
        next();
    }
    catch {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};
const ContactMessageSchema = new mongoose_1.Schema({
    name: { type: String, required: false, default: null },
    email: { type: String, required: false, default: null },
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: false, default: null, index: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    handled: { type: Boolean, required: true, default: false, index: true },
}, { timestamps: { createdAt: "createdAt", updatedAt: false } });
const ContactMessage = mongoose_1.default.models.ContactMessage || mongoose_1.default.model("ContactMessage", ContactMessageSchema);
const ChatMessageSchema = new mongoose_1.Schema({
    room: { type: mongoose_1.Schema.Types.ObjectId, ref: "ChatRoom", required: true, index: true },
    senderUser: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: false, default: null },
    senderRole: { type: String, required: true, enum: ["user", "support", "system"], default: "user" },
    text: { type: String, required: true },
    meta: { type: mongoose_1.Schema.Types.Mixed, required: false, default: null },
}, { timestamps: { createdAt: "createdAt", updatedAt: false } });
const SupportChatMessage = mongoose_1.default.models.SupportChatMessage || mongoose_1.default.model("SupportChatMessage", ChatMessageSchema);
const ChatRoomSchema = new mongoose_1.Schema({
    participants: { type: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "User" }], required: true, index: true },
    subject: { type: String, required: false, default: null },
    status: { type: String, required: true, default: "open", enum: ["open", "closed", "archived"], index: true },
    lastMessageAt: { type: Date, required: false, default: null },
}, { timestamps: { createdAt: "createdAt", updatedAt: false } });
const ChatRoom = mongoose_1.default.models.ChatRoom || mongoose_1.default.model("ChatRoom", ChatRoomSchema);
/* -----------------------
   Routes
   ----------------------- */
/**
 * POST /api/v1/support/contact
 * Public contact form (authenticated or anonymous)
 * Body: { name?, email?, subject, message }
 */
router.post("/contact", (0, express_validator_1.body)("name").optional().isString().trim().isLength({ min: 1, max: 200 }), (0, express_validator_1.body)("email").optional().isEmail().normalizeEmail(), (0, express_validator_1.body)("subject").isString().trim().isLength({ min: 3, max: 200 }), (0, express_validator_1.body)("message").isString().trim().isLength({ min: 3, max: 5000 }), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty())
            return res.status(422).json({ errors: errors.array() });
        const { name, email, subject, message } = req.body;
        // If auth present, try to attach user id (non-blocking)
        let userId = null;
        try {
            // Note: We intentionally don't invoke softAuth middleware here to keep
            // the endpoint usable by anonymous users. Instead we attempt to read the
            // Authorization header and verify token if present.
            const auth = req.header("authorization");
            if (auth && auth.startsWith("Bearer ")) {
                const jwt = require("jsonwebtoken");
                const secret = process.env.JWT_SECRET || "please-change-this-secret";
                try {
                    const payload = jwt.verify(auth.slice(7).trim(), secret);
                    if (payload && payload.sub && mongoose_1.default.Types.ObjectId.isValid(payload.sub)) {
                        userId = new mongoose_1.default.Types.ObjectId(payload.sub);
                    }
                }
                catch {
                    // ignore token errors — treat as anonymous
                }
            }
        }
        catch {
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
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/support/chat
 * Returns list of chat rooms for the authenticated user.
 * Query: ?limit=20&before=<ISO date or message id> (simple)
 */
router.get("/chat", softAuth, (0, express_validator_1.query)("limit").optional().toInt(), async (req, res, next) => {
    try {
        const user = req.user;
        const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
        const rooms = await ChatRoom.find({ participants: user._id })
            .sort({ lastMessageAt: -1, createdAt: -1 })
            .limit(limit)
            .lean()
            .exec();
        return res.json({ rooms });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/support/chat/:roomId
 * Fetch messages for a chat room (authenticated user must be a participant)
 * Query params: ?limit=50
 */
router.get("/chat/:roomId", softAuth, (0, express_validator_1.param)("roomId").isString(), (0, express_validator_1.query)("limit").optional().toInt(), async (req, res, next) => {
    try {
        const user = req.user;
        const { roomId } = req.params;
        if (!mongoose_1.default.Types.ObjectId.isValid(roomId))
            return res.status(400).json({ message: "Invalid roomId" });
        const room = await ChatRoom.findById(roomId).exec();
        if (!room)
            return res.status(404).json({ message: "Chat room not found" });
        // Ensure the requesting user is a participant
        const isParticipant = (room.participants || []).some((p) => p.toString() === user._id.toString());
        if (!isParticipant)
            return res.status(403).json({ message: "Access denied" });
        const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
        const messages = await SupportChatMessage.find({ room: room._id })
            .sort({ createdAt: 1 })
            .limit(limit)
            .lean()
            .exec();
        return res.json({ room: { ...room.toObject() }, messages });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/support/chat
 * Send a message to support or create a new chat.
 * Body: { roomId?: string, text: string, subject?: string }
 */
router.post("/chat", softAuth, (0, express_validator_1.body)("roomId").optional().isString(), (0, express_validator_1.body)("text").isString().trim().isLength({ min: 1, max: 4000 }), (0, express_validator_1.body)("subject").optional().isString().trim().isLength({ min: 3, max: 200 }), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty())
            return res.status(422).json({ errors: errors.array() });
        const user = req.user;
        const { roomId, text, subject } = req.body;
        let room = null;
        if (roomId) {
            if (!mongoose_1.default.Types.ObjectId.isValid(roomId))
                return res.status(400).json({ message: "Invalid roomId" });
            room = (await ChatRoom.findById(roomId).exec());
            if (!room)
                return res.status(404).json({ message: "Chat room not found" });
            const isParticipant = (room.participants || []).some((p) => p.toString() === user._id.toString());
            if (!isParticipant)
                return res.status(403).json({ message: "Not a participant in this chat" });
        }
        else {
            // Create new chat room with the user as a participant.
            room = await ChatRoom.create({
                participants: [user._id],
                subject: subject || null,
                status: "open",
                lastMessageAt: new Date(),
            });
        }
        // create message
        const msg = await SupportChatMessage.create({
            room: room._id,
            senderUser: user._id,
            senderRole: "user",
            text,
            meta: null,
        });
        // update room lastMessageAt and ensure user is in participants
        const participantIds = new Set((room.participants || []).map((p) => p.toString()));
        participantIds.add(user._id.toString());
        room.participants = Array.from(participantIds).map((id) => new mongoose_1.default.Types.ObjectId(id));
        room.lastMessageAt = msg.createdAt;
        await room.save();
        // In production you'd notify support agents / push socket events here.
        // Broadcast to all participants in the room via Socket.IO
        try {
            const io = req.app?.locals?.io;
            if (io) {
                const payload = {
                    room: room._id,
                    message: {
                        _id: msg._id,
                        room: room._id,
                        senderRole: "user",
                        text,
                        createdAt: msg.createdAt,
                    },
                };
                io.to(`support:${room._id}`).emit("support:message", payload);
            }
        }
        catch (e) {
            // socket broadcast is best-effort
        }
        return res.status(201).json({ message: "Message sent", roomId: room._id, messageId: msg._id, sentAt: msg.createdAt });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/support/chat/:roomId/close
 * Close a chat room (user or support can close). Auth required and must be participant.
 */
router.post("/chat/:roomId/close", softAuth, (0, express_validator_1.param)("roomId").isString(), async (req, res, next) => {
    try {
        const user = req.user;
        const { roomId } = req.params;
        if (!mongoose_1.default.Types.ObjectId.isValid(roomId))
            return res.status(400).json({ message: "Invalid roomId" });
        const room = await ChatRoom.findById(roomId).exec();
        if (!room)
            return res.status(404).json({ message: "Chat room not found" });
        const isParticipant = (room.participants || []).some((p) => p.toString() === user._id.toString());
        if (!isParticipant)
            return res.status(403).json({ message: "Not a participant" });
        room.status = "closed";
        await room.save();
        // Optionally create a system message
        await SupportChatMessage.create({
            room: room._id,
            senderUser: null,
            senderRole: "system",
            text: "Chat closed by user",
        });
        return res.json({ message: "Chat closed", roomId: room._id });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=support.js.map