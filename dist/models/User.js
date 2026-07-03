"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const uuid_1 = require("uuid");
const userSchema = new mongoose_1.default.Schema({
    uuid: {
        type: String,
        required: true,
        unique: true,
        default: () => (0, uuid_1.v4)(),
        index: true,
    },
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 30,
        index: true,
    },
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
    // fields populated from Clerk / social providers
    displayName: {
        type: String,
        required: false,
        default: null,
    },
    avatarUrl: {
        type: String,
        required: false,
        default: null,
    },
    clerkId: {
        type: String,
        required: false,
        default: null,
        index: true,
    },
    clerkCreatedAt: {
        type: Date,
        required: false,
        default: null,
    },
    googleId: {
        type: String,
        required: false,
        default: null,
        index: true,
    },
    dob: {
        type: Date,
        required: false,
        default: null,
    },
    postcode: {
        type: String,
        required: false,
        default: null,
    },
    // ban fields for admin functionality
    isBanned: {
        type: Boolean,
        required: false,
        default: false,
    },
    banReason: {
        type: String,
        required: false,
        default: null,
    },
    bannedAt: {
        type: Date,
        required: false,
        default: null,
    },
    banDuration: {
        type: Number,
        required: false,
        default: null,
    },
    banExpiresAt: {
        type: Date,
        required: false,
        default: null,
    },
    // warning system
    warnings: [
        {
            reason: { type: String, required: true },
            issuedBy: { type: String, required: true },
            issuedAt: { type: Date, default: Date.now },
        },
    ],
    warningCount: {
        type: Number,
        required: false,
        default: 0,
    },
    // hold time for rewards
    rewardHoldTimeDays: {
        type: Number,
        required: false,
        default: null,
    },
    // earnings tracking
    totalEarned: {
        type: Number,
        required: false,
        default: 0,
    },
    totalPaidOut: {
        type: Number,
        required: false,
        default: 0,
    },
    // fraud detection
    lastLoginIp: {
        type: String,
        required: false,
        default: null,
    },
    lastLoginDevice: {
        type: String,
        required: false,
        default: null,
    },
    loginHistory: [
        {
            ip: { type: String, required: true },
            device: { type: String, required: true },
            timestamp: { type: Date, default: Date.now },
            location: { type: String, required: false },
        },
    ],
    isVpnUser: {
        type: Boolean,
        required: false,
        default: false,
    },
    isProxyUser: {
        type: Boolean,
        required: false,
        default: false,
    },
    vpnDetectedAt: {
        type: Date,
        required: false,
        default: null,
    },
    vpnDetectionReason: {
        type: String,
        required: false,
        default: null,
    },
    // admin notes
    adminNotes: [
        {
            note: { type: String, required: true },
            addedBy: { type: String, required: true },
            addedAt: { type: Date, default: Date.now },
        },
    ],
    // referral custom commission
    customReferralRate: {
        type: Number,
        required: false,
        default: null,
        min: 0,
        max: 100,
    },
    // user status
    accountStatus: {
        type: String,
        enum: ["active", "suspended", "banned", "pending"],
        required: false,
        default: "active",
    },
    balanceCents: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },
    affiliateCode: {
        type: String,
        required: false,
        default: null,
        index: true,
    },
    referredBy: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "User",
        required: false,
        default: null,
    },
    agreedToTerms: {
        type: Boolean,
        required: true,
        default: false,
    },
    lastDailyCheckin: {
        type: Date,
        required: false,
        default: null,
    },
    streakDays: {
        type: Number,
        required: false,
        default: 0,
    },
    profilePrivacy: {
        type: String,
        enum: ["public", "private"],
        required: false,
        default: "public",
    },
    // onboarding / survey profile completion
    profileCompleted: {
        type: Boolean,
        required: false,
        default: false,
    },
    surveyAnswers: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
        default: {},
    },
    // Two-Factor Authentication fields
    twoFactorEnabled: {
        type: Boolean,
        required: false,
        default: false,
    },
    twoFactorSecret: {
        type: String,
        required: false,
        default: null,
        select: false, // Don't include in normal queries
    },
    twoFactorTempSecret: {
        type: String,
        required: false,
        default: null,
        select: false, // Don't include in normal queries
    },
    twoFactorBackupCodes: [
        {
            code: { type: String, required: true },
            used: { type: Boolean, default: false },
        },
    ],
    activityScore: {
        type: Number,
        required: false,
        default: 0,
        min: 0,
    },
    activityStats: {
        offersCompleted: { type: Number, default: 0, min: 0 },
        surveysCompleted: { type: Number, default: 0, min: 0 },
        successfulReferrals: { type: Number, default: 0, min: 0 },
        dailyLogins: { type: Number, default: 0, min: 0 },
    },
    activityBadges: {
        firstOfferCompleted: { type: Boolean, default: false },
        tenOffersCompleted: { type: Boolean, default: false },
        fiftyOffersCompleted: { type: Boolean, default: false },
        firstReferral: { type: Boolean, default: false },
        fiveReferrals: { type: Boolean, default: false },
        accountAge30DaysActive: { type: Boolean, default: false },
    },
    lastActivityLoginAt: {
        type: Date,
        required: false,
        default: null,
    },
}, {
    timestamps: true,
    // hide __v by default when converting to JSON
    toJSON: {
        virtuals: true,
        transform(doc, ret) {
            // remove sensitive/internal fields
            delete ret._id;
            delete ret.__v;
            delete ret.passwordHash;
            // keep uuid, username, email, balanceCents, affiliateCode, etc.
            return ret;
        },
    },
    toObject: { virtuals: true },
});
/**
 * Instance method: compare a candidate plain password to stored hash
 */
userSchema.methods.comparePassword = async function (candidate) {
    // `this` is IUser & Document
    const hash = this.passwordHash;
    if (!hash)
        return false;
    return bcryptjs_1.default.compare(candidate, hash);
};
/**
 * Instance method: set password (hashes and assigns passwordHash)
 */
userSchema.methods.setPassword = async function (plain) {
    const saltRounds = 10;
    const hash = await bcryptjs_1.default.hash(plain, saltRounds);
    this.passwordHash = hash;
};
/**
 * Static helper: find user by email (case-insensitive)
 */
userSchema.statics.findByEmail = function (email) {
    return this.findOne({ email: email.toLowerCase().trim() }).exec();
};
/**
 * Pre-save hook:
 * - ensure username/email are trimmed/lowercased appropriately
 * - if passwordHash looks like a plain password (rare), hash it
 */
userSchema.pre("save", async function (next) {
    try {
        // normalize
        if (this.isModified("email") && typeof this.email === "string") {
            this.email = this.email.toLowerCase().trim();
        }
        if (this.isModified("username") && typeof this.username === "string") {
            this.username = this.username.trim();
        }
        // If passwordHash was changed and looks like a plain password (very unlikely),
        // we hash it. We check by length: bcrypt hashes are 60 chars; if it's shorter,
        // we assume it's a plain password.
        if (this.isModified("passwordHash") &&
            this.passwordHash &&
            this.passwordHash.length < 60) {
            const saltRounds = 10;
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const hash = await bcryptjs_1.default.hash(this.passwordHash, saltRounds);
            this.passwordHash = hash;
        }
        return next();
    }
    catch (err) {
        return next(err);
    }
});
/**
 * Virtual id to expose uuid preferentially (already have `uuid`).
 * Keep for clients that expect `id` property.
 */
userSchema.virtual("id").get(function () {
    return this.uuid;
});
/**
 * Indexes
 */
userSchema.index({ email: 1 }, { unique: true, background: true });
userSchema.index({ username: 1 }, { unique: true, background: true });
userSchema.index({ uuid: 1 }, { unique: true, background: true });
userSchema.index({ affiliateCode: 1 });
const User = mongoose_1.default.model("User", userSchema);
exports.default = User;
//# sourceMappingURL=User.js.map