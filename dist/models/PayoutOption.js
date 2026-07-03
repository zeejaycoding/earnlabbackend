"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const schema = new mongoose_1.default.Schema({
    key: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, required: false },
    enabled: { type: Boolean, required: true, default: true },
});
const PayoutOption = mongoose_1.default.models.PayoutOption || mongoose_1.default.model('PayoutOption', schema);
exports.default = PayoutOption;
//# sourceMappingURL=PayoutOption.js.map