"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const systemSettingsSchema = new mongoose_1.Schema({
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
}, {
    timestamps: true,
});
// Ensure only one document exists
systemSettingsSchema.pre("save", async function (next) {
    if (this.isNew) {
        const count = await mongoose_1.default.model("SystemSettings").countDocuments();
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
const SystemSettings = mongoose_1.default.model("SystemSettings", systemSettingsSchema);
exports.default = SystemSettings;
//# sourceMappingURL=SystemSettings.js.map