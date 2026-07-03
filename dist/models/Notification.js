"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const schema = new mongoose_1.default.Schema({
    user: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    read: { type: Boolean, required: true, default: false, index: true },
    meta: { type: mongoose_1.default.Schema.Types.Mixed, required: false, default: null },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
const Notification = mongoose_1.default.models.Notification || mongoose_1.default.model('Notification', schema);
exports.default = Notification;
//# sourceMappingURL=Notification.js.map