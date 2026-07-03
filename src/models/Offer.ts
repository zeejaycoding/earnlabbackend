import mongoose, { Document, Model } from "mongoose";

export interface IOffer extends Document {
  offerId: string; // unique offer ID from provider
  provider: string; // CPX, Lootably, AdGate, etc.
  name: string;
  description?: string;
  imageUrl?: string;
  category: "games" | "surveys" | "apps" | "other";
  rewardCents: number;
  payout: number; // amount user gets
  revenue: number; // amount we get from provider
  country?: string[];
  platform?: string[]; // web, ios, android
  holdTimeDays?: number; // hold time before user can withdraw
  isActive: boolean;
  conversionType?: string; // install, signup, purchase, etc.
  difficulty?: "easy" | "medium" | "hard";
  estimatedTime?: number; // in minutes
  requirements?: string[];
  status: "active" | "paused" | "disabled";
  completions: number; // how many times completed
  totalRevenue: number; // total revenue generated
  totalPayout: number; // total paid to users
  createdAt: Date;
  updatedAt: Date;
}

const offerSchema = new mongoose.Schema<IOffer>(
  {
    offerId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: false,
    },
    imageUrl: {
      type: String,
      required: false,
    },
    category: {
      type: String,
      enum: ["games", "surveys", "apps", "other"],
      required: true,
      default: "other",
      index: true,
    },
    rewardCents: {
      type: Number,
      required: true,
      min: 0,
    },
    payout: {
      type: Number,
      required: true,
      default: 0,
    },
    revenue: {
      type: Number,
      required: true,
      default: 0,
    },
    country: [
      {
        type: String,
      },
    ],
    platform: [
      {
        type: String,
      },
    ],
    holdTimeDays: {
      type: Number,
      required: false,
      default: 7,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    conversionType: {
      type: String,
      required: false,
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      required: false,
    },
    estimatedTime: {
      type: Number,
      required: false,
    },
    requirements: [
      {
        type: String,
      },
    ],
    status: {
      type: String,
      enum: ["active", "paused", "disabled"],
      required: true,
      default: "active",
      index: true,
    },
    completions: {
      type: Number,
      required: true,
      default: 0,
    },
    totalRevenue: {
      type: Number,
      required: true,
      default: 0,
    },
    totalPayout: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
offerSchema.index({ provider: 1, status: 1 });
offerSchema.index({ category: 1, isActive: 1 });
offerSchema.index({ createdAt: -1 });

const Offer = mongoose.model<IOffer>("Offer", offerSchema);

export default Offer;
