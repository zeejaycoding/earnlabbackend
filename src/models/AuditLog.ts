import mongoose, { Document } from "mongoose";

export interface IAuditLog extends Document {
  adminId: string;
  adminEmail: string;
  action: string;
  actionType:
    | "user_management"
    | "payout"
    | "offer"
    | "promo"
    | "notification"
    | "system"
    | "security"
    | "referral"
    | "support";
  targetType?: "user" | "withdrawal" | "offer" | "promo" | "notification" | "system";
  targetId?: string;
  changes?: {
    before?: any;
    after?: any;
  };
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
  severity: "low" | "medium" | "high" | "critical";
  createdAt: Date;
}

const auditLogSchema = new mongoose.Schema<IAuditLog>(
  {
    adminId: {
      type: String,
      required: true,
      index: true,
    },
    adminEmail: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    actionType: {
      type: String,
      enum: [
        "user_management",
        "payout",
        "offer",
        "promo",
        "notification",
        "system",
        "security",
        "referral",
        "support",
      ],
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ["user", "withdrawal", "offer", "promo", "notification", "system"],
      required: false,
      index: true,
    },
    targetId: {
      type: String,
      required: false,
      index: true,
    },
    changes: {
      before: {
        type: mongoose.Schema.Types.Mixed,
        required: false,
      },
      after: {
        type: mongoose.Schema.Types.Mixed,
        required: false,
      },
    },
    reason: {
      type: String,
      required: false,
    },
    ipAddress: {
      type: String,
      required: false,
    },
    userAgent: {
      type: String,
      required: false,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "low",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
auditLogSchema.index({ adminId: 1, createdAt: -1 });
auditLogSchema.index({ actionType: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ severity: 1, createdAt: -1 });

const AuditLog = mongoose.model<IAuditLog>("AuditLog", auditLogSchema);

export default AuditLog;
