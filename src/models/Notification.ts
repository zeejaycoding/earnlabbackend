import mongoose, { Document } from 'mongoose';

export interface INotification extends Document {
  user: mongoose.Types.ObjectId;
  type: string;
  title: string;
  body: string;
  read: boolean;
  meta?: Record<string, any> | null;
  createdAt: Date;
}

const schema = new mongoose.Schema<INotification>(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    read: { type: Boolean, required: true, default: false, index: true },
    meta: { type: mongoose.Schema.Types.Mixed, required: false, default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

const Notification = mongoose.models.Notification || mongoose.model<INotification>('Notification', schema);

export default Notification;
