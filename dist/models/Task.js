"use strict";
/**
 * src/models/Task.ts
 *
 * Mongoose model for Tasks (offers, surveys, daily tasks, quests).
 *
 * The model is intentionally flexible and stores:
 * - a task descriptor (title, description, type)
 * - reward information (rewardCents)
 * - optional association to a user when the task is claimed or assigned
 * - lightweight progress & status fields
 * - optional external identifiers for 3rd-party offerwalls
 *
 * This is a domain model suitable for the demo app. In production you may
 * want to split responsibilities (claiming, reward processing, anti-fraud)
 * into services and add more indexes, TTL or retention policies.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const TaskSchema = new mongoose_1.default.Schema({
    title: { type: String, required: true, trim: true, index: true },
    description: { type: String, required: false, default: null },
    type: { type: String, required: true, default: 'one-time', index: true },
    rewardCents: { type: Number, required: true, default: 0, min: 0 },
    user: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: false, default: null, index: true },
    externalId: { type: String, required: false, default: null, index: true },
    status: { type: String, required: true, default: 'available', enum: ['available', 'in_progress', 'completed', 'failed', 'cancelled'], index: true },
    progressPercent: { type: Number, required: true, default: 0, min: 0, max: 100 },
    metadata: { type: mongoose_1.default.Schema.Types.Mixed, required: false, default: null },
    availableFrom: { type: Date, required: false, default: null, index: true },
    expiresAt: { type: Date, required: false, default: null, index: true },
    completedAt: { type: Date, required: false, default: null },
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform(doc, ret) {
            // remove internal mongoose fields
            delete ret.__v;
            return ret;
        },
    },
    toObject: { virtuals: true },
});
/**
 * Instance method: claim
 * Assigns the task to a user and marks it in_progress if currently available.
 */
TaskSchema.methods.claim = async function (userId) {
    // `this` is a document
    if (this.status !== 'available') {
        throw new Error('Task not available for claiming');
    }
    this.user = userId;
    this.status = 'in_progress';
    this.progressPercent = 0;
    await this.save();
};
/**
 * Instance method: complete
 * Marks the task as completed if the claiming user matches (or if unassigned).
 * Optionally accept a different earnedCents value (e.g., adjusted by admin/provider).
 *
 * Note: This method only updates the Task document. Crediting the user's balance
 * should be performed by a service that ensures idempotency and handles transactions.
 */
TaskSchema.methods.complete = async function (userId, earnedCents) {
    if (this.user && this.user.toString() !== userId.toString()) {
        throw new Error('User not authorized to complete this task');
    }
    this.status = 'completed';
    this.progressPercent = 100;
    this.completedAt = new Date();
    // If caller provided an override reward, update rewardCents (use carefully)
    if (typeof earnedCents === 'number' && Number.isFinite(earnedCents) && earnedCents >= 0) {
        this.rewardCents = Math.round(earnedCents);
    }
    await this.save();
};
/**
 * Static helper: findAvailable
 * Returns available tasks that are currently claimable.
 * - respects availableFrom and expiresAt
 * - status must be 'available'
 */
TaskSchema.statics.findAvailable = function (limit = 50) {
    const now = new Date();
    const filter = {
        status: 'available',
        $and: [
            { $or: [{ availableFrom: null }, { availableFrom: { $lte: now } }] },
            { $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] },
        ],
    };
    return this.find(filter).sort({ createdAt: -1 }).limit(limit).lean().exec();
};
/**
 * Indexes for common queries
 */
TaskSchema.index({ status: 1, type: 1 });
TaskSchema.index({ user: 1, status: 1 });
TaskSchema.index({ externalId: 1 });
const Task = mongoose_1.default.models.Task || mongoose_1.default.model('Task', TaskSchema);
exports.default = Task;
//# sourceMappingURL=Task.js.map