"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const premiumOfferSchema = new mongoose_1.default.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        required: false,
        trim: true,
    },
    imageUrl: {
        type: String,
        required: false,
    },
    trackingUrl: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        enum: ["game", "app", "survey", "other"],
        required: true,
        default: "other",
        index: true,
    },
    rewardCents: {
        type: Number,
        required: true,
        min: 0,
    },
    platform: {
        type: String,
        enum: ["ios", "android", "desktop", "all"],
        required: true,
        default: "all",
        index: true,
    },
    status: {
        type: String,
        enum: ["active", "inactive", "paused"],
        required: true,
        default: "active",
        index: true,
    },
    requirements: [
        {
            type: String,
        },
    ],
    country: [
        {
            type: String,
        },
    ],
    priority: {
        type: Number,
        required: true,
        default: 0,
        index: true,
    },
    completions: {
        type: Number,
        required: true,
        default: 0,
    },
    totalPayout: {
        type: Number,
        required: true,
        default: 0,
    },
    provider: {
        type: String,
        required: false,
    },
    expiresAt: {
        type: Date,
        required: false,
        default: null,
    },
    showOnWelcomePage: {
        type: Boolean,
        required: true,
        default: true,
        index: true,
    },
    showOnEarnPage: {
        type: Boolean,
        required: true,
        default: true,
        index: true,
    },
    // Completion cap feature - for advertiser daily limits
    completionCap: {
        type: Number,
        required: false,
        default: null, // null means unlimited
        min: 0,
    },
    dailyCompletions: {
        type: Number,
        required: true,
        default: 0,
    },
    lastCapReset: {
        type: Date,
        required: false,
        default: null,
    },
    createdBy: {
        type: String,
        required: true,
    },
    updatedBy: {
        type: String,
        required: false,
    },
}, {
    timestamps: true,
});
// Indexes for common queries
premiumOfferSchema.index({ status: 1, platform: 1, priority: -1 });
premiumOfferSchema.index({ type: 1, status: 1 });
premiumOfferSchema.index({ createdAt: -1 });
const PremiumOffer = mongoose_1.default.models.PremiumOffer ||
    mongoose_1.default.model("PremiumOffer", premiumOfferSchema);
exports.default = PremiumOffer;
//# sourceMappingURL=PremiumOffer.js.map