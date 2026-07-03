"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const schema = new mongoose_1.default.Schema({
    user: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountCents: { type: Number, required: true, min: 1 },
    method: { type: String, required: true, enum: ['crypto', 'paypal', 'giftcard', 'bank_transfer'] },
    destination: { type: String, required: true },
    status: { type: String, required: true, default: 'Pending', enum: ['Pending', 'Approved', 'Rejected', 'Completed', 'Cancelled'], index: true },
    giftCardType: { type: String, enum: ['amazon', 'google_play', 'apple_itunes', 'steam', 'xbox', 'playstation', null], default: null, sparse: true },
    giftCardDenomination: { type: Number, default: null },
    giftCardCurrency: { type: String, enum: ['USD', 'EUR', null], default: null, sparse: true },
    giftCardCode: { type: String, default: null },
    approvalNotes: { type: String, default: null },
    rejectionReason: { type: String, default: null },
    approvedBy: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: String, default: null },
    rejectedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    balanceAtWithdrawalCents: { type: Number, default: null },
}, { timestamps: true });
const Withdrawal = mongoose_1.default.models.Withdrawal || mongoose_1.default.model('Withdrawal', schema);
exports.default = Withdrawal;
//# sourceMappingURL=Withdrawal.js.map