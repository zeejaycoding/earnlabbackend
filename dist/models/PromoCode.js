"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const promoCodeSchema = new mongoose_1.default.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
        index: true,
    },
    amountCents: {
        type: Number,
        required: true,
        min: 1,
    },
    usageLimit: {
        type: Number,
        required: true,
        min: 1,
    },
    usedCount: {
        type: Number,
        default: 0,
        min: 0,
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    usedBy: [
        {
            type: mongoose_1.default.Schema.Types.ObjectId,
            ref: "User",
        },
    ],
    validFrom: {
        type: Date,
        required: false,
        default: Date.now,
    },
    expiresAt: {
        type: Date,
        required: false,
        index: true,
    },
    description: {
        type: String,
        required: false,
    },
    promoType: {
        type: String,
        enum: ["standard", "first_user", "double_points", "bonus"],
        default: "standard",
    },
    maxUsesPerUser: {
        type: Number,
        required: false,
        default: 1,
        min: 1,
    },
    minBalanceRequired: {
        type: Number,
        required: false,
        default: 0,
        min: 0,
    },
    createdBy: {
        type: String,
        required: false,
    },
}, {
    timestamps: true,
});
// Indexes
promoCodeSchema.index({ code: 1 }, { unique: true });
promoCodeSchema.index({ isActive: 1, expiresAt: 1 });
promoCodeSchema.index({ createdAt: -1 });
// Method to check if promo code is valid
promoCodeSchema.methods.isValid = function () {
    if (!this.isActive)
        return false;
    if (this.usedCount >= this.usageLimit)
        return false;
    if (this.expiresAt && new Date() > this.expiresAt)
        return false;
    if (this.validFrom && new Date() < this.validFrom)
        return false;
    return true;
};
// Method to check if user can use this promo
promoCodeSchema.methods.canUserUse = function (userId) {
    if (!this.isValid())
        return false;
    const userUsageCount = this.usedBy.filter((id) => id.toString() === userId.toString()).length;
    return userUsageCount < (this.maxUsesPerUser || 1);
};
const PromoCode = mongoose_1.default.model("PromoCode", promoCodeSchema);
exports.default = PromoCode;
//# sourceMappingURL=PromoCode.js.map