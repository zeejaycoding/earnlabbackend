import mongoose, { Document, Model } from "mongoose";
import bcrypt from "bcryptjs";

export interface IAdminUser extends Document {
  email: string;
  passwordHash: string;
  name: string;
  role: "superadmin" | "admin" | "support" | "finance";
  permissions: string[];
  isActive: boolean;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  loginAttempts: number;
  lockedUntil?: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;

  // instance methods
  comparePassword(candidate: string): Promise<boolean>;
  setPassword(plain: string): Promise<void>;
  incrementLoginAttempts(): Promise<void>;
  resetLoginAttempts(): Promise<void>;
  isLocked(): boolean;
}

export interface IAdminUserModel extends Model<IAdminUser> {
  findByEmail(email: string): Promise<IAdminUser | null>;
}

const adminUserSchema = new mongoose.Schema<IAdminUser>(
  {
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
  },
  {
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
  }
);

// Instance method: compare password
adminUserSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidate, this.passwordHash);
};

// Instance method: set password
adminUserSchema.methods.setPassword = async function (
  plain: string
): Promise<void> {
  const saltRounds = 12; // Higher for admin accounts
  const hash = await bcrypt.hash(plain, saltRounds);
  this.passwordHash = hash;
};

// Instance method: increment login attempts
adminUserSchema.methods.incrementLoginAttempts = async function (): Promise<void> {
  // Lock account for 1 hour after 5 failed attempts
  if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
    this.lockedUntil = new Date(Date.now() + 60 * 60 * 1000);
  }
  this.loginAttempts += 1;
  await this.save();
};

// Instance method: reset login attempts
adminUserSchema.methods.resetLoginAttempts = async function (): Promise<void> {
  this.loginAttempts = 0;
  this.lockedUntil = undefined;
  await this.save();
};

// Instance method: check if account is locked
adminUserSchema.methods.isLocked = function (): boolean {
  if (!this.lockedUntil) return false;
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
adminUserSchema.statics.findByEmail = function (
  email: string
): Promise<IAdminUser | null> {
  return this.findOne({ email: email.toLowerCase().trim() }).exec();
};

// Pre-save hook: hash password if modified
adminUserSchema.pre<IAdminUser>("save", async function (next) {
  try {
    if (this.isModified("email") && typeof this.email === "string") {
      this.email = this.email.toLowerCase().trim();
    }

    // Auto-hash if passwordHash looks like plain text
    if (
      this.isModified("passwordHash") &&
      this.passwordHash &&
      this.passwordHash.length < 60
    ) {
      const saltRounds = 12;
      const hash = await bcrypt.hash(this.passwordHash, saltRounds);
      this.passwordHash = hash;
    }

    return next();
  } catch (err) {
    return next(err as any);
  }
});

// Indexes
adminUserSchema.index({ email: 1 }, { unique: true });
adminUserSchema.index({ role: 1, isActive: 1 });

const AdminUser = mongoose.model<IAdminUser, IAdminUserModel>(
  "AdminUser",
  adminUserSchema
);

export default AdminUser;
