import mongoose, { Document, Model } from "mongoose";

export interface IPremiumOffer extends Document {
  title: string;
  description?: string;
  imageUrl?: string;
  trackingUrl: string; // External advertiser API or tracking link
  type: "game" | "app" | "survey" | "other";
  rewardCents: number; // Reward amount in cents
  platform: "ios" | "android" | "desktop" | "all";
  status: "active" | "inactive" | "paused";
  requirements?: string[];
  country?: string[]; // Supported countries
  priority: number; // For ordering (higher = shown first)
  completions: number; // Track how many times completed
  totalPayout: number; // Total paid to users
  provider?: string; // Optional provider name
  expiresAt?: Date | null; // Optional expiration date
  showOnWelcomePage: boolean; // Show on post-login welcome/home page
  showOnEarnPage: boolean; // Show on earn tab/page
  // Completion cap feature - for advertiser daily limits
  completionCap?: number | null; // Max completions allowed (null = unlimited)
  dailyCompletions: number; // Current day's completion count
  lastCapReset?: Date | null; // When daily completions were last reset
  createdBy: string; // Admin who created this
  updatedBy?: string; // Last admin who updated
  createdAt: Date;
  updatedAt: Date;
}

const premiumOfferSchema = new mongoose.Schema<IPremiumOffer>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: false,
      trim: true,
    },
    imageUrl: {
      type: String,
      required: false,
    },
    trackingUrl: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["game", "app", "survey", "other"],
      required: true,
      default: "other",
      index: true,
    },
    rewardCents: {
      type: Number,
      required: true,
      min: 0,
    },
    platform: {
      type: String,
      enum: ["ios", "android", "desktop", "all"],
      required: true,
      default: "all",
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "paused"],
      required: true,
      default: "active",
      index: true,
    },
    requirements: [
      {
        type: String,
      },
    ],
    country: [
      {
        type: String,
      },
    ],
    priority: {
      type: Number,
      required: true,
      default: 0,
      index: true,
    },
    completions: {
      type: Number,
      required: true,
      default: 0,
    },
    totalPayout: {
      type: Number,
      required: true,
      default: 0,
    },
    provider: {
      type: String,
      required: false,
    },
    expiresAt: {
      type: Date,
      required: false,
      default: null,
    },
    showOnWelcomePage: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    showOnEarnPage: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    // Completion cap feature - for advertiser daily limits
    completionCap: {
      type: Number,
      required: false,
      default: null, // null means unlimited
      min: 0,
    },
    dailyCompletions: {
      type: Number,
      required: true,
      default: 0,
    },
    lastCapReset: {
      type: Date,
      required: false,
      default: null,
    },
    createdBy: {
      type: String,
      required: true,
    },
    updatedBy: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
premiumOfferSchema.index({ status: 1, platform: 1, priority: -1 });
premiumOfferSchema.index({ type: 1, status: 1 });
premiumOfferSchema.index({ createdAt: -1 });

const PremiumOffer: Model<IPremiumOffer> =
  mongoose.models.PremiumOffer ||
  mongoose.model<IPremiumOffer>("PremiumOffer", premiumOfferSchema);

export default PremiumOffer;
