"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const supportTicketSchema = new mongoose_1.default.Schema({
    ticketId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    user: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    subject: {
        type: String,
        required: true,
        trim: true,
    },
    category: {
        type: String,
        enum: ["technical", "payment", "account", "offer", "other"],
        default: "other",
        index: true,
    },
    priority: {
        type: String,
        enum: ["low", "medium", "high", "urgent"],
        default: "medium",
        index: true,
    },
    status: {
        type: String,
        enum: ["open", "in_progress", "waiting_user", "resolved", "closed"],
        default: "open",
        index: true,
    },
    messages: [
        {
            sender: {
                type: String,
                enum: ["user", "admin"],
                required: true,
            },
            senderName: {
                type: String,
                required: true,
            },
            message: {
                type: String,
                required: true,
            },
            timestamp: {
                type: Date,
                default: Date.now,
            },
            attachments: [
                {
                    type: String,
                },
            ],
        },
    ],
    assignedTo: {
        type: String,
        required: false,
        index: true,
    },
    assignedAt: {
        type: Date,
        required: false,
    },
    resolvedAt: {
        type: Date,
        required: false,
    },
    resolvedBy: {
        type: String,
        required: false,
    },
    tags: [
        {
            type: String,
        },
    ],
    metadata: {
        type: mongoose_1.default.Schema.Types.Mixed,
        required: false,
    },
}, {
    timestamps: true,
});
// Indexes for efficient queries
supportTicketSchema.index({ user: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ priority: 1, status: 1 });
supportTicketSchema.index({ assignedTo: 1, status: 1 });
supportTicketSchema.index({ category: 1, status: 1 });
// Generate unique ticket ID before saving
supportTicketSchema.pre("save", async function (next) {
    if (!this.ticketId) {
        const count = await mongoose_1.default.model("SupportTicket").countDocuments();
        this.ticketId = `TKT-${(count + 1).toString().padStart(6, "0")}`;
    }
    next();
});
const SupportTicket = mongoose_1.default.model("SupportTicket", supportTicketSchema);
exports.default = SupportTicket;
//# sourceMappingURL=SupportTicket.js.map