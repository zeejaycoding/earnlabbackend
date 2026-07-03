"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const tournamentSchema = new mongoose_1.default.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    imageUrl: {
        type: String,
        required: false,
        default: null,
    },
    status: {
        type: String,
        enum: ["active", "coming_soon", "ended"],
        required: true,
        default: "coming_soon",
        index: true,
    },
    prizePool: {
        type: Number,
        required: false,
        default: 0,
        min: 0,
    },
    description: {
        type: String,
        required: false,
        trim: true,
    },
    startDate: {
        type: Date,
        required: false,
        default: null,
    },
    endDate: {
        type: Date,
        required: false,
        default: null,
    },
    priority: {
        type: Number,
        required: true,
        default: 0,
        index: true,
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
tournamentSchema.index({ status: 1, priority: -1 });
const Tournament = mongoose_1.default.models.Tournament ||
    mongoose_1.default.model("Tournament", tournamentSchema);
exports.default = Tournament;
//# sourceMappingURL=Tournament.js.map