import mongoose, { Document, Model } from "mongoose";

export interface ITournament extends Document {
  name: string;
  imageUrl?: string;
  status: "active" | "coming_soon" | "ended";
  prizePool?: number;
  description?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  priority: number;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tournamentSchema = new mongoose.Schema<ITournament>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: String,
      required: false,
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "coming_soon", "ended"],
      required: true,
      default: "coming_soon",
      index: true,
    },
    prizePool: {
      type: Number,
      required: false,
      default: 0,
      min: 0,
    },
    description: {
      type: String,
      required: false,
      trim: true,
    },
    startDate: {
      type: Date,
      required: false,
      default: null,
    },
    endDate: {
      type: Date,
      required: false,
      default: null,
    },
    priority: {
      type: Number,
      required: true,
      default: 0,
      index: true,
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
  },
);

tournamentSchema.index({ status: 1, priority: -1 });

const Tournament: Model<ITournament> =
  mongoose.models.Tournament ||
  mongoose.model<ITournament>("Tournament", tournamentSchema);

export default Tournament;
