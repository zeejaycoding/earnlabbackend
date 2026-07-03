"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const offerLogSchema = new mongoose_1.default.Schema({
    user: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    offerId: {
        type: String,
        required: true,
        index: true,
    },
    provider: {
        type: String,
        required: true,
        index: true,
    },
    offerName: {
        type: String,
        required: true,
    },
    amountCents: {
        type: Number,
        required: true,
        min: 0,
    },
    status: {
        type: String,
        enum: ["pending", "approved", "rejected", "held"],
        required: true,
        default: "pending",
        index: true,
    },
    transactionId: {
        type: String,
        required: false,
        index: true,
    },
    ipAddress: {
        type: String,
        required: false,
    },
    userAgent: {
        type: String,
        required: false,
    },
    proofUrl: {
        type: String,
        required: false,
    },
    proofSubmittedAt: {
        type: Date,
        required: false,
    },
    rejectionReason: {
        type: String,
        required: false,
    },
    holdUntil: {
        type: Date,
        required: false,
        index: true,
    },
    approvedAt: {
        type: Date,
        required: false,
    },
    approvedBy: {
        type: String,
        required: false,
    },
    metadata: {
        type: mongoose_1.default.Schema.Types.Mixed,
        required: false,
    },
}, {
    timestamps: true,
});
// Indexes for efficient queries
offerLogSchema.index({ user: 1, createdAt: -1 });
offerLogSchema.index({ status: 1, createdAt: -1 });
offerLogSchema.index({ provider: 1, status: 1 });
offerLogSchema.index({ holdUntil: 1 });
const OfferLog = mongoose_1.default.model("OfferLog", offerLogSchema);
exports.default = OfferLog;
//# sourceMappingURL=OfferLog.js.map