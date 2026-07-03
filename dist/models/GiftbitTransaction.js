"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const schema = new mongoose_1.default.Schema({
    user: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        required: true,
        enum: ['Payout', 'Payment'],
        default: 'Payout'
    },
    brandCode: {
        type: String,
        required: true,
        index: true
    },
    brandName: {
        type: String,
        required: true
    },
    amountCents: {
        type: Number,
        required: true,
        min: 1
    },
    currency: {
        type: String,
        required: true,
        default: 'USD'
    },
    status: {
        type: String,
        required: true,
        enum: ['Pending', 'Processing', 'Completed', 'Failed', 'Cancelled'],
        default: 'Pending',
        index: true
    },
    recipientEmail: {
        type: String,
        required: true
    },
    recipientName: {
        type: String,
        required: false
    },
    giftMessage: {
        type: String,
        required: false
    },
    giftbitOrderId: {
        type: String,
        required: false,
        index: true
    },
    giftbitCardId: {
        type: String,
        required: false,
        index: true
    },
    redemptionUrl: {
        type: String,
        required: false
    },
    cardNumber: {
        type: String,
        required: false
    },
    cardPin: {
        type: String,
        required: false
    },
    expiryDate: {
        type: Date,
        required: false
    },
    errorMessage: {
        type: String,
        required: false
    },
    metadata: {
        type: mongoose_1.default.Schema.Types.Mixed,
        required: false
    },
}, {
    timestamps: true
});
// Index for efficient queries
schema.index({ user: 1, status: 1, createdAt: -1 });
schema.index({ giftbitOrderId: 1 });
const GiftbitTransaction = mongoose_1.default.models.GiftbitTransaction ||
    mongoose_1.default.model('GiftbitTransaction', schema);
exports.default = GiftbitTransaction;
//# sourceMappingURL=GiftbitTransaction.js.map