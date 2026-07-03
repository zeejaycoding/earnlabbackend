"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const adminUserSchema = new mongoose_1.default.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    passwordHash: {
        type: String,
        required: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    role: {
        type: String,
        enum: ["superadmin", "admin", "support", "finance"],
        default: "support",
        required: true,
        index: true,
    },
    permissions: [
        {
            type: String,
        },
    ],
    isActive: {
        type: Boolean,
        default: true,
        required: true,
    },
    lastLoginAt: {
        type: Date,
        required: false,
    },
    lastLoginIp: {
        type: String,
        required: false,
    },
    twoFactorEnabled: {
        type: Boolean,
        default: false,
        required: true,
    },
    twoFactorSecret: {
        type: String,
        required: false,
    },
    loginAttempts: {
        type: Number,
        default: 0,
        required: true,
    },
    lockedUntil: {
        type: Date,
        required: false,
    },
    createdBy: {
        type: String,
        required: false,
    },
}, {
    timestamps: true,
    toJSON: {
        transform(doc, ret) {
            delete ret._id;
            delete ret.__v;
            delete ret.passwordHash;
            delete ret.twoFactorSecret;
            return ret;
        },
    },
});
// Instance method: compare password
adminUserSchema.methods.comparePassword = async function (candidate) {
    if (!this.passwordHash)
        return false;
    return bcryptjs_1.default.compare(candidate, this.passwordHash);
};
// Instance method: set password
adminUserSchema.methods.setPassword = async function (plain) {
    const saltRounds = 12; // Higher for admin accounts
    const hash = await bcryptjs_1.default.hash(plain, saltRounds);
    this.passwordHash = hash;
};
// Instance method: increment login attempts
adminUserSchema.methods.incrementLoginAttempts = async function () {
    // Lock account for 1 hour after 5 failed attempts
    if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
        this.lockedUntil = new Date(Date.now() + 60 * 60 * 1000);
    }
    this.loginAttempts += 1;
    await this.save();
};
// Instance method: reset login attempts
adminUserSchema.methods.resetLoginAttempts = async function () {
    this.loginAttempts = 0;
    this.lockedUntil = undefined;
    await this.save();
};
// Instance method: check if account is locked
adminUserSchema.methods.isLocked = function () {
    if (!this.lockedUntil)
        return false;
    if (this.lockedUntil < new Date()) {
        // Lock has expired, reset
        this.loginAttempts = 0;
        this.lockedUntil = undefined;
        this.save();
        return false;
    }
    return true;
};
// Static method: find by email
adminUserSchema.statics.findByEmail = function (email) {
    return this.findOne({ email: email.toLowerCase().trim() }).exec();
};
// Pre-save hook: hash password if modified
adminUserSchema.pre("save", async function (next) {
    try {
        if (this.isModified("email") && typeof this.email === "string") {
            this.email = this.email.toLowerCase().trim();
        }
        // Auto-hash if passwordHash looks like plain text
        if (this.isModified("passwordHash") &&
            this.passwordHash &&
            this.passwordHash.length < 60) {
            const saltRounds = 12;
            const hash = await bcryptjs_1.default.hash(this.passwordHash, saltRounds);
            this.passwordHash = hash;
        }
        return next();
    }
    catch (err) {
        return next(err);
    }
});
// Indexes
adminUserSchema.index({ email: 1 }, { unique: true });
adminUserSchema.index({ role: 1, isActive: 1 });
const AdminUser = mongoose_1.default.model("AdminUser", adminUserSchema);
exports.default = AdminUser;
//# sourceMappingURL=AdminUser.js.map