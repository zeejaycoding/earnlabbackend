import mongoose, { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

export interface IUser extends Document {
  uuid: string;
  username: string;
  email: string;
  passwordHash: string;
  // optional display fields sourced from social providers (Clerk / Google)
  displayName?: string | null;
  avatarUrl?: string | null;
  clerkId?: string | null;
  clerkCreatedAt?: Date | null;
  googleId?: string | null;
  dob?: Date | null;
  postcode?: string | null;
  // last time the user claimed the daily bonus
  lastDailyCheckin?: Date | null;
  // consecutive daily streak count
  streakDays?: number;
  // onboarding / survey profile completion
  profileCompleted?: boolean;
  surveyAnswers?: Record<string, string>;
  balanceCents: number;
  affiliateCode?: string | null;
  referredBy?: mongoose.Types.ObjectId | null;
  agreedToTerms: boolean;
  // profile privacy setting
  profilePrivacy?: "public" | "private";
  // ban fields for admin functionality
  isBanned?: boolean;
  banReason?: string | null;
  bannedAt?: Date | null;
  banDuration?: number | null; // in days, null means permanent
  banExpiresAt?: Date | null;
  // warning system
  warnings?: Array<{
    reason: string;
    issuedBy: string;
    issuedAt: Date;
  }>;
  warningCount?: number;
  // hold time for rewards
  rewardHoldTimeDays?: number; // custom hold time per user
  // earnings tracking
  totalEarned?: number; // total points ever earned
  totalPaidOut?: number; // total points paid out
  // fraud detection
  lastLoginIp?: string | null;
  lastLoginDevice?: string | null;
  loginHistory?: Array<{
    ip: string;
    device: string;
    timestamp: Date;
    location?: string;
  }>;
  isVpnUser?: boolean;
  isProxyUser?: boolean;
  vpnDetectedAt?: Date | null;
  vpnDetectionReason?: string | null;
  // admin notes
  adminNotes?: Array<{
    note: string;
    addedBy: string;
    addedAt: Date;
  }>;
  // referral custom commission
  customReferralRate?: number | null; // custom commission rate (0-100)
  // user status
  accountStatus?: "active" | "suspended" | "banned" | "pending";
  // Two-Factor Authentication
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string | null;
  twoFactorTempSecret?: string | null;
  twoFactorBackupCodes?: string[];
  // activity progression (visual-only)
  activityScore?: number;
  activityStats?: {
    offersCompleted: number;
    surveysCompleted: number;
    successfulReferrals: number;
    dailyLogins: number;
  };
  activityBadges?: {
    firstOfferCompleted: boolean;
    tenOffersCompleted: boolean;
    fiftyOffersCompleted: boolean;
    firstReferral: boolean;
    fiveReferrals: boolean;
    accountAge30DaysActive: boolean;
  };
  lastActivityLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;

  // instance methods
  comparePassword(candidate: string): Promise<boolean>;
  setPassword(plain: string): Promise<void>;
  toJSON(): Record<string, any>;
}

export interface IUserModel extends Model<IUser> {
  // static helpers if needed in future (e.g. findByEmail)
  findByEmail(email: string): Promise<IUser | null>;
}

const userSchema = new mongoose.Schema<IUser>(
  {
    uuid: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
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
      type: mongoose.Schema.Types.ObjectId,
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
      type: Schema.Types.Mixed,
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
  },
  {
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
  },
);

/**
 * Instance method: compare a candidate plain password to stored hash
 */
userSchema.methods.comparePassword = async function (
  candidate: string,
): Promise<boolean> {
  // `this` is IUser & Document
  const hash = this.passwordHash as string;
  if (!hash) return false;
  return bcrypt.compare(candidate, hash);
};

/**
 * Instance method: set password (hashes and assigns passwordHash)
 */
userSchema.methods.setPassword = async function (plain: string): Promise<void> {
  const saltRounds = 10;
  const hash = await bcrypt.hash(plain, saltRounds);
  this.passwordHash = hash;
};

/**
 * Static helper: find user by email (case-insensitive)
 */
userSchema.statics.findByEmail = function (
  email: string,
): Promise<IUser | null> {
  return this.findOne({ email: email.toLowerCase().trim() }).exec();
};

/**
 * Pre-save hook:
 * - ensure username/email are trimmed/lowercased appropriately
 * - if passwordHash looks like a plain password (rare), hash it
 */
userSchema.pre<IUser>("save", async function (next) {
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
    if (
      this.isModified("passwordHash") &&
      this.passwordHash &&
      this.passwordHash.length < 60
    ) {
      const saltRounds = 10;
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const hash = await bcrypt.hash(this.passwordHash, saltRounds);
      this.passwordHash = hash;
    }

    return next();
  } catch (err) {
    return next(err as any);
  }
});

/**
 * Virtual id to expose uuid preferentially (already have `uuid`).
 * Keep for clients that expect `id` property.
 */
userSchema.virtual("id").get(function (this: IUser) {
  return this.uuid;
});

/**
 * Indexes
 */
userSchema.index({ email: 1 }, { unique: true, background: true });
userSchema.index({ username: 1 }, { unique: true, background: true });
userSchema.index({ uuid: 1 }, { unique: true, background: true });
userSchema.index({ affiliateCode: 1 });

const User = mongoose.model<IUser, IUserModel>("User", userSchema);

export default User;
