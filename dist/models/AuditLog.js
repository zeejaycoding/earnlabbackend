"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const auditLogSchema = new mongoose_1.default.Schema({
    adminId: {
        type: String,
        required: true,
        index: true,
    },
    adminEmail: {
        type: String,
        required: true,
        index: true,
    },
    action: {
        type: String,
        required: true,
        index: true,
    },
    actionType: {
        type: String,
        enum: [
            "user_management",
            "payout",
            "offer",
            "promo",
            "notification",
            "system",
            "security",
            "referral",
            "support",
        ],
        required: true,
        index: true,
    },
    targetType: {
        type: String,
        enum: ["user", "withdrawal", "offer", "promo", "notification", "system"],
        required: false,
        index: true,
    },
    targetId: {
        type: String,
        required: false,
        index: true,
    },
    changes: {
        before: {
            type: mongoose_1.default.Schema.Types.Mixed,
            required: false,
        },
        after: {
            type: mongoose_1.default.Schema.Types.Mixed,
            required: false,
        },
    },
    reason: {
        type: String,
        required: false,
    },
    ipAddress: {
        type: String,
        required: false,
    },
    userAgent: {
        type: String,
        required: false,
    },
    metadata: {
        type: mongoose_1.default.Schema.Types.Mixed,
        required: false,
    },
    severity: {
        type: String,
        enum: ["low", "medium", "high", "critical"],
        default: "low",
        index: true,
    },
}, {
    timestamps: true,
});
// Indexes for efficient querying
auditLogSchema.index({ adminId: 1, createdAt: -1 });
auditLogSchema.index({ actionType: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ severity: 1, createdAt: -1 });
const AuditLog = mongoose_1.default.model("AuditLog", auditLogSchema);
exports.default = AuditLog;
//# sourceMappingURL=AuditLog.js.map