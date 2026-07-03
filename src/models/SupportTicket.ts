import mongoose, { Document } from "mongoose";

export interface ISupportTicket extends Document {
  ticketId: string;
  user: mongoose.Types.ObjectId;
  subject: string;
  category: "technical" | "payment" | "account" | "offer" | "other";
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "waiting_user" | "resolved" | "closed";
  messages: Array<{
    sender: "user" | "admin";
    senderName: string;
    message: string;
    timestamp: Date;
    attachments?: string[];
  }>;
  assignedTo?: string;
  assignedAt?: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  tags?: string[];
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

const supportTicketSchema = new mongoose.Schema<ISupportTicket>(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["technical", "payment", "account", "offer", "other"],
      default: "other",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
      index: true,
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "waiting_user", "resolved", "closed"],
      default: "open",
      index: true,
    },
    messages: [
      {
        sender: {
          type: String,
          enum: ["user", "admin"],
          required: true,
        },
        senderName: {
          type: String,
          required: true,
        },
        message: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        attachments: [
          {
            type: String,
          },
        ],
      },
    ],
    assignedTo: {
      type: String,
      required: false,
      index: true,
    },
    assignedAt: {
      type: Date,
      required: false,
    },
    resolvedAt: {
      type: Date,
      required: false,
    },
    resolvedBy: {
      type: String,
      required: false,
    },
    tags: [
      {
        type: String,
      },
    ],
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
supportTicketSchema.index({ user: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ priority: 1, status: 1 });
supportTicketSchema.index({ assignedTo: 1, status: 1 });
supportTicketSchema.index({ category: 1, status: 1 });

// Generate unique ticket ID before saving
supportTicketSchema.pre<ISupportTicket>("save", async function (next) {
  if (!this.ticketId) {
    const count = await mongoose.model("SupportTicket").countDocuments();
    this.ticketId = `TKT-${(count + 1).toString().padStart(6, "0")}`;
  }
  next();
});

const SupportTicket = mongoose.model<ISupportTicket>(
  "SupportTicket",
  supportTicketSchema
);

export default SupportTicket;
