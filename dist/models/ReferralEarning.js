"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const schema = new mongoose_1.default.Schema({
    user: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referrer: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountCents: { type: Number, required: true, min: 0 },
    claimed: { type: Boolean, required: true, default: false, index: true },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
const ReferralEarning = mongoose_1.default.models.ReferralEarning || mongoose_1.default.model('ReferralEarning', schema);
exports.default = ReferralEarning;
//# sourceMappingURL=ReferralEarning.js.map