import mongoose, { Document } from "mongoose";

export interface IPromoCode extends Document {
  code: string;
  amountCents: number;
  usageLimit: number;
  usedCount: number;
  isActive: boolean;
  usedBy: mongoose.Types.ObjectId[];
  validFrom?: Date;
  expiresAt?: Date;
  description?: string;
  promoType: "standard" | "first_user" | "double_points" | "bonus";
  maxUsesPerUser?: number;
  minBalanceRequired?: number;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const promoCodeSchema = new mongoose.Schema<IPromoCode>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    amountCents: {
      type: Number,
      required: true,
      min: 1,
    },
    usageLimit: {
      type: Number,
      required: true,
      min: 1,
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    usedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    validFrom: {
      type: Date,
      required: false,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: false,
      index: true,
    },
    description: {
      type: String,
      required: false,
    },
    promoType: {
      type: String,
      enum: ["standard", "first_user", "double_points", "bonus"],
      default: "standard",
    },
    maxUsesPerUser: {
      type: Number,
      required: false,
      default: 1,
      min: 1,
    },
    minBalanceRequired: {
      type: Number,
      required: false,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
promoCodeSchema.index({ code: 1 }, { unique: true });
promoCodeSchema.index({ isActive: 1, expiresAt: 1 });
promoCodeSchema.index({ createdAt: -1 });

// Method to check if promo code is valid
promoCodeSchema.methods.isValid = function (): boolean {
  if (!this.isActive) return false;
  if (this.usedCount >= this.usageLimit) return false;
  if (this.expiresAt && new Date() > this.expiresAt) return false;
  if (this.validFrom && new Date() < this.validFrom) return false;
  return true;
};

// Method to check if user can use this promo
promoCodeSchema.methods.canUserUse = function (
  userId: mongoose.Types.ObjectId
): boolean {
  if (!this.isValid()) return false;
  const userUsageCount = this.usedBy.filter(
    (id: any) => id.toString() === userId.toString()
  ).length;
  return userUsageCount < (this.maxUsesPerUser || 1);
};

const PromoCode = mongoose.model<IPromoCode>("PromoCode", promoCodeSchema);

export default PromoCode;
