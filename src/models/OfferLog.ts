import mongoose, { Document } from "mongoose";

export interface IOfferLog extends Document {
  user: mongoose.Types.ObjectId;
  offerId: string;
  provider: string;
  offerName: string;
  amountCents: number;
  status: "pending" | "approved" | "rejected" | "held";
  transactionId?: string;
  ipAddress?: string;
  userAgent?: string;
  proofUrl?: string;
  proofSubmittedAt?: Date;
  rejectionReason?: string;
  holdUntil?: Date;
  approvedAt?: Date;
  approvedBy?: string;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

const offerLogSchema = new mongoose.Schema<IOfferLog>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    offerId: {
      type: String,
      required: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
      index: true,
    },
    offerName: {
      type: String,
      required: true,
    },
    amountCents: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "held"],
      required: true,
      default: "pending",
      index: true,
    },
    transactionId: {
      type: String,
      required: false,
      index: true,
    },
    ipAddress: {
      type: String,
      required: false,
    },
    userAgent: {
      type: String,
      required: false,
    },
    proofUrl: {
      type: String,
      required: false,
    },
    proofSubmittedAt: {
      type: Date,
      required: false,
    },
    rejectionReason: {
      type: String,
      required: false,
    },
    holdUntil: {
      type: Date,
      required: false,
      index: true,
    },
    approvedAt: {
      type: Date,
      required: false,
    },
    approvedBy: {
      type: String,
      required: false,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
offerLogSchema.index({ user: 1, createdAt: -1 });
offerLogSchema.index({ status: 1, createdAt: -1 });
offerLogSchema.index({ provider: 1, status: 1 });
offerLogSchema.index({ holdUntil: 1 });

const OfferLog = mongoose.model<IOfferLog>("OfferLog", offerLogSchema);

export default OfferLog;
