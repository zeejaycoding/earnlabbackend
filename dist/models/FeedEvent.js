"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const schema = new mongoose_1.default.Schema({
    type: { type: String, required: true },
    text: { type: String, required: true },
    amountCents: { type: Number, required: false, default: null },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
const FeedEvent = mongoose_1.default.models.FeedEvent || mongoose_1.default.model('FeedEvent', schema);
exports.default = FeedEvent;
//# sourceMappingURL=FeedEvent.js.map