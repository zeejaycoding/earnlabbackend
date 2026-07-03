"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const offerSchema = new mongoose_1.default.Schema({
    offerId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    provider: {
        type: String,
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: false,
    },
    imageUrl: {
        type: String,
        required: false,
    },
    category: {
        type: String,
        enum: ["games", "surveys", "apps", "other"],
        required: true,
        default: "other",
        index: true,
    },
    rewardCents: {
        type: Number,
        required: true,
        min: 0,
    },
    payout: {
        type: Number,
        required: true,
        default: 0,
    },
    revenue: {
        type: Number,
        required: true,
        default: 0,
    },
    country: [
        {
            type: String,
        },
    ],
    platform: [
        {
            type: String,
        },
    ],
    holdTimeDays: {
        type: Number,
        required: false,
        default: 7,
    },
    isActive: {
        type: Boolean,
        required: true,
        default: true,
    },
    conversionType: {
        type: String,
        required: false,
    },
    difficulty: {
        type: String,
        enum: ["easy", "medium", "hard"],
        required: false,
    },
    estimatedTime: {
        type: Number,
        required: false,
    },
    requirements: [
        {
            type: String,
        },
    ],
    status: {
        type: String,
        enum: ["active", "paused", "disabled"],
        required: true,
        default: "active",
        index: true,
    },
    completions: {
        type: Number,
        required: true,
        default: 0,
    },
    totalRevenue: {
        type: Number,
        required: true,
        default: 0,
    },
    totalPayout: {
        type: Number,
        required: true,
        default: 0,
    },
}, {
    timestamps: true,
});
// Indexes
offerSchema.index({ provider: 1, status: 1 });
offerSchema.index({ category: 1, isActive: 1 });
offerSchema.index({ createdAt: -1 });
const Offer = mongoose_1.default.model("Offer", offerSchema);
exports.default = Offer;
//# sourceMappingURL=Offer.js.map