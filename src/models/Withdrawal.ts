import mongoose, { Document } from 'mongoose';

export type WithdrawalStatus = 'Pending' | 'Approved' | 'Rejected' | 'Completed' | 'Cancelled';
export type WithdrawalMethod = 'crypto' | 'paypal' | 'giftcard' | 'bank_transfer';
export type GiftCardType = 'amazon' | 'google_play' | 'apple_itunes' | 'steam' | 'xbox' | 'playstation';
export type GiftCardCurrency = 'USD' | 'EUR';

export interface IWithdrawal extends Document {
  user: mongoose.Types.ObjectId;
  amountCents: number;
  method: WithdrawalMethod;
  destination: string; // e.g. wallet address, paypal email, or email for gift card
  status: WithdrawalStatus;
  cryptoType?: string | null; // e.g. 'btc', 'sol', 'eth' — which crypto was selected
  giftCardType?: GiftCardType | null; // if method is 'giftcard'
  giftCardDenomination?: number | null; // e.g., 10, 20, 50, 100
  giftCardCurrency?: GiftCardCurrency | null; // USD or EUR
  giftCardCode?: string | null; // admin will add this after approval
  approvalNotes?: string | null;
  rejectionReason?: string | null;
  approvedBy?: string | null; // admin email
  approvedAt?: Date | null;
  rejectedBy?: string | null; // admin email
  rejectedAt?: Date | null;
  completedAt?: Date | null;
  balanceAtWithdrawalCents?: number; // balance before withdrawal was deducted
  createdAt: Date;
  updatedAt: Date;
}

const schema = new mongoose.Schema<IWithdrawal>(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountCents: { type: Number, required: true, min: 1 },
    method: { type: String, required: true, enum: ['crypto', 'paypal', 'giftcard', 'bank_transfer'] },
    destination: { type: String, required: true },
    status: { type: String, required: true, default: 'Pending', enum: ['Pending', 'Approved', 'Rejected', 'Completed', 'Cancelled'], index: true },
    cryptoType: { type: String, default: null },
    giftCardType: { type: String, enum: ['amazon', 'google_play', 'apple_itunes', 'steam', 'xbox', 'playstation', null], default: null, sparse: true },
    giftCardDenomination: { type: Number, default: null },
    giftCardCurrency: { type: String, enum: ['USD', 'EUR', null], default: null, sparse: true },
    giftCardCode: { type: String, default: null },
    approvalNotes: { type: String, default: null },
    rejectionReason: { type: String, default: null },
    approvedBy: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: String, default: null },
    rejectedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    balanceAtWithdrawalCents: { type: Number, default: null },
  },
  { timestamps: true }
);

const Withdrawal = mongoose.models.Withdrawal || mongoose.model<IWithdrawal>('Withdrawal', schema);

export default Withdrawal;
