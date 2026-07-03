import mongoose, { Document, Model } from 'mongoose';

export interface IReferralEarning extends Document {
  user: mongoose.Types.ObjectId; // the user who earned
  referrer: mongoose.Types.ObjectId; // the user who referred
  amountCents: number;
  claimed: boolean;
  createdAt: Date;
}

const schema = new mongoose.Schema<IReferralEarning>(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referrer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountCents: { type: Number, required: true, min: 0 },
    claimed: { type: Boolean, required: true, default: false, index: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

const ReferralEarning = mongoose.models.ReferralEarning || mongoose.model<IReferralEarning>('ReferralEarning', schema);

export default ReferralEarning;
