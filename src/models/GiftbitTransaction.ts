import mongoose, { Document } from 'mongoose';

export type GiftbitTransactionStatus = 'Pending' | 'Processing' | 'Completed' | 'Failed' | 'Cancelled';
export type GiftbitTransactionType = 'Payout' | 'Payment';

export interface IGiftbitTransaction extends Document {
  user: mongoose.Types.ObjectId;
  type: GiftbitTransactionType;
  brandCode: string;
  brandName: string;
  amountCents: number;
  currency: string;
  status: GiftbitTransactionStatus;
  recipientEmail: string;
  recipientName?: string;
  giftMessage?: string;
  giftbitOrderId?: string;
  giftbitCardId?: string;
  redemptionUrl?: string;
  cardNumber?: string;
  cardPin?: string;
  expiryDate?: Date;
  errorMessage?: string;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new mongoose.Schema<IGiftbitTransaction>(
  {
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true, 
      index: true 
    },
    type: { 
      type: String, 
      required: true, 
      enum: ['Payout', 'Payment'],
      default: 'Payout'
    },
    brandCode: { 
      type: String, 
      required: true,
      index: true
    },
    brandName: { 
      type: String, 
      required: true 
    },
    amountCents: { 
      type: Number, 
      required: true, 
      min: 1 
    },
    currency: { 
      type: String, 
      required: true, 
      default: 'USD' 
    },
    status: { 
      type: String, 
      required: true, 
      enum: ['Pending', 'Processing', 'Completed', 'Failed', 'Cancelled'],
      default: 'Pending',
      index: true
    },
    recipientEmail: { 
      type: String, 
      required: true 
    },
    recipientName: { 
      type: String, 
      required: false 
    },
    giftMessage: { 
      type: String, 
      required: false 
    },
    giftbitOrderId: { 
      type: String, 
      required: false,
      index: true
    },
    giftbitCardId: { 
      type: String, 
      required: false,
      index: true
    },
    redemptionUrl: { 
      type: String, 
      required: false 
    },
    cardNumber: { 
      type: String, 
      required: false 
    },
    cardPin: { 
      type: String, 
      required: false 
    },
    expiryDate: { 
      type: Date, 
      required: false 
    },
    errorMessage: { 
      type: String, 
      required: false 
    },
    metadata: { 
      type: mongoose.Schema.Types.Mixed, 
      required: false 
    },
  },
  { 
    timestamps: true 
  }
);

// Index for efficient queries
schema.index({ user: 1, status: 1, createdAt: -1 });
schema.index({ giftbitOrderId: 1 });

const GiftbitTransaction = mongoose.models.GiftbitTransaction || 
  mongoose.model<IGiftbitTransaction>('GiftbitTransaction', schema);

export default GiftbitTransaction;
