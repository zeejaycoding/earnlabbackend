import mongoose, { Schema, Document } from "mongoose";

export interface ISystemSettings extends Document {
  siteName: string;
  logo?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  themeMode: "light" | "dark" | "auto";
  fontFamily: string;
  borderRadius: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpSecure?: boolean;
  minPayoutCents: number;
  maxPayoutCents: number;
  defaultHoldTimeDays: number;
  referralEnabled: boolean;
  defaultReferralRate: number;
  activityScoreConfig: {
    offerCompletion: number;
    surveyCompletion: number;
    dailyLogin: number;
    successfulReferral: number;
  };
  activityLevelThresholds: {
    beginnerMax: number;
    amateurMax: number;
    advancedMax: number;
    proMax: number;
  };
  vpnDetectionEnabled: boolean;
  proxyDetectionEnabled: boolean;
  maintenanceMode: boolean;
  paypalFeePercent?: number;
  bankTransferFeePercent?: number;
  cryptoFeePercent?: number;
  createdAt: Date;
  updatedAt: Date;
}

const systemSettingsSchema = new Schema<ISystemSettings>(
  {
    siteName: {
      type: String,
      default: "Labwards",
      required: true,
    },
    logo: {
      type: String,
      default: null,
    },
    primaryColor: {
      type: String,
      default: "#4f46e5",
      match: /^#[0-9A-Fa-f]{6}$/,
    },
    secondaryColor: {
      type: String,
      default: "#06b6d4",
      match: /^#[0-9A-Fa-f]{6}$/,
    },
    accentColor: {
      type: String,
      default: "#f59e0b",
      match: /^#[0-9A-Fa-f]{6}$/,
    },
    themeMode: {
      type: String,
      enum: ["light", "dark", "auto"],
      default: "auto",
    },
    fontFamily: {
      type: String,
      enum: ["system", "inter", "poppins", "roboto", "open-sans"],
      default: "system",
    },
    borderRadius: {
      type: String,
      enum: ["small", "medium", "large", "extra-large"],
      default: "medium",
    },
    smtpHost: {
      type: String,
      default: null,
    },
    smtpPort: {
      type: Number,
      default: 587,
    },
    smtpUser: {
      type: String,
      default: null,
    },
    smtpSecure: {
      type: Boolean,
      default: true,
    },
    minPayoutCents: {
      type: Number,
      default: 1000,
      min: 0,
    },
    maxPayoutCents: {
      type: Number,
      default: 500000,
      min: 0,
    },
    defaultHoldTimeDays: {
      type: Number,
      default: 7,
      min: 0,
    },
    referralEnabled: {
      type: Boolean,
      default: true,
    },
    defaultReferralRate: {
      type: Number,
      default: 5,
      min: 0,
      max: 100,
    },
    activityScoreConfig: {
      offerCompletion: {
        type: Number,
        default: 5,
        min: 0,
      },
      surveyCompletion: {
        type: Number,
        default: 3,
        min: 0,
      },
      dailyLogin: {
        type: Number,
        default: 1,
        min: 0,
      },
      successfulReferral: {
        type: Number,
        default: 10,
        min: 0,
      },
    },
    activityLevelThresholds: {
      beginnerMax: {
        type: Number,
        default: 30,
        min: 0,
      },
      amateurMax: {
        type: Number,
        default: 80,
        min: 1,
      },
      advancedMax: {
        type: Number,
        default: 180,
        min: 2,
      },
      proMax: {
        type: Number,
        default: 350,
        min: 3,
      },
    },
    vpnDetectionEnabled: {
      type: Boolean,
      default: true,
    },
    proxyDetectionEnabled: {
      type: Boolean,
      default: true,
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
    paypalFeePercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    bankTransferFeePercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    cryptoFeePercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
  },
);

// Ensure only one document exists
systemSettingsSchema.pre("save", async function (next) {
  if (this.isNew) {
    const count = await mongoose.model("SystemSettings").countDocuments();
    if (count > 0) {
      throw new Error("Only one system settings document is allowed");
    }
  }
  next();
});

// Static method to get or create settings
systemSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

interface ISystemSettingsModel extends mongoose.Model<ISystemSettings> {
  getSettings(): Promise<ISystemSettings>;
}

const SystemSettings = mongoose.model<ISystemSettings, ISystemSettingsModel>(
  "SystemSettings",
  systemSettingsSchema,
) as ISystemSettingsModel;

export default SystemSettings;
