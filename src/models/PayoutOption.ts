import mongoose, { Document } from 'mongoose';

export interface IPayoutOption extends Document {
  key: string; // e.g. 'paypal', 'crypto', 'worldcoin'
  name: string;
  description?: string;
  enabled: boolean;
}

const schema = new mongoose.Schema<IPayoutOption>({
  key: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  description: { type: String, required: false },
  enabled: { type: Boolean, required: true, default: true },
});

const PayoutOption = mongoose.models.PayoutOption || mongoose.model<IPayoutOption>('PayoutOption', schema);

export default PayoutOption;
