import mongoose, { Document } from 'mongoose';

export interface IFeedEvent extends Document {
  type: string;
  text: string;
  amountCents?: number | null;
  createdAt: Date;
}

const schema = new mongoose.Schema<IFeedEvent>(
  {
    type: { type: String, required: true },
    text: { type: String, required: true },
    amountCents: { type: Number, required: false, default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

const FeedEvent = mongoose.models.FeedEvent || mongoose.model<IFeedEvent>('FeedEvent', schema);

export default FeedEvent;
