"use strict";
/**
 * src/seed-tasks.ts
 *
 * Seed script to add sample tasks to the MongoDB database.
 *
 * Usage:
 *   - Run with: `ts-node src/seed-tasks.ts`
 */
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importStar(require("mongoose"));
dotenv_1.default.config();
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/earnlab";
const TaskSchema = new mongoose_1.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    type: { type: String, default: "one-time" },
    rewardCents: { type: Number, required: true, default: 0, min: 0 },
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", default: null },
    externalId: { type: String, default: null },
    status: { type: String, default: "available" },
    progressPercent: { type: Number, default: 0 },
    metadata: { type: mongoose_1.Schema.Types.Mixed, default: null },
    availableFrom: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
}, { timestamps: true });
const Task = mongoose_1.default.models.Task || mongoose_1.default.model("Task", TaskSchema);
const now = new Date();
const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
const sampleTasks = [
    {
        title: "Install & Try AppDemo",
        description: "Download AppDemo from the App Store or Play Store, install it, and open it once to earn your reward.",
        type: "offer",
        rewardCents: 350,
        expiresAt: in30Days,
        metadata: {
            platform: "android",
            platforms: ["android", "ios"],
            providerName: "Lootably",
            offerwall: "CPA Offerwall",
        },
    },
    {
        title: "Sign Up for StreamFlix",
        description: "Create a free account on StreamFlix and verify your email address to complete this task.",
        type: "offer",
        rewardCents: 500,
        expiresAt: in14Days,
        metadata: {
            platform: "desktop",
            platforms: ["desktop"],
            providerName: "AdGate Media",
            offerwall: "CPA Offerwall",
        },
    },
    {
        title: "Complete a Short Survey",
        description: "Answer a quick 5-minute survey about your shopping habits and earn instantly.",
        type: "survey",
        rewardCents: 150,
        expiresAt: in7Days,
        metadata: {
            platforms: ["desktop", "android", "ios"],
            providerName: "CPX Research",
            offerwall: "SurveyWall",
        },
    },
    {
        title: "Daily Login Challenge",
        description: "Log in to your Earnlab account every day this week. Rewards increase each consecutive day!",
        type: "daily",
        rewardCents: 200,
        metadata: {
            platforms: ["desktop", "android", "ios"],
            providerName: "Earnlab",
            offerwall: "Internal",
        },
    },
    {
        title: "Refer 3 Friends",
        description: "Share your referral link with 3 friends. Once they sign up and complete their first task, you earn a bonus.",
        type: "quest",
        rewardCents: 750,
        metadata: {
            platforms: ["desktop", "android", "ios"],
            providerName: "Earnlab",
            offerwall: "Internal",
        },
    },
    {
        title: "Install GameRush & Reach Level 5",
        description: "Download GameRush, create an account, and play until you reach level 5. Progress is tracked automatically.",
        type: "offer",
        rewardCents: 1200,
        expiresAt: in30Days,
        metadata: {
            platform: "android",
            platforms: ["android"],
            providerName: "Mylead",
            offerwall: "CPA Offerwall",
        },
    },
    {
        title: "Watch & Rate a Video",
        description: "Watch a 2-minute product video on our partner site and leave a quick rating to earn rewards.",
        type: "one-time",
        rewardCents: 75,
        expiresAt: in14Days,
        metadata: {
            platform: "desktop",
            platforms: ["desktop"],
            providerName: "Lootably",
            offerwall: "CPA Offerwall",
        },
    },
    {
        title: "Try Freebird Rides",
        description: "Sign up for Freebird Rides using the link below and take your first ride within 7 days.",
        type: "offer",
        rewardCents: 2000,
        expiresAt: in30Days,
        metadata: {
            platform: "ios",
            platforms: ["ios", "android"],
            providerName: "AdGate Media",
            offerwall: "CPA Offerwall",
        },
    },
    {
        title: "Complete Your Profile",
        description: "Fill out your profile details including name, bio, and profile picture to unlock badge rewards.",
        type: "one-time",
        rewardCents: 50,
        metadata: {
            platforms: ["desktop", "android", "ios"],
            providerName: "Earnlab",
            offerwall: "Internal",
        },
    },
    {
        title: "10-Minute Market Research Survey",
        description: "Share your opinion in this detailed market research survey. Takes about 10 minutes to complete.",
        type: "survey",
        rewardCents: 400,
        expiresAt: in7Days,
        metadata: {
            platforms: ["desktop", "android", "ios"],
            providerName: "CPX Research",
            offerwall: "SurveyWall",
        },
    },
];
async function seedTasks() {
    console.log(`Connecting to MongoDB: ${MONGODB_URI}`);
    await mongoose_1.default.connect(MONGODB_URI);
    console.log("Connected.\n");
    let inserted = 0;
    for (const task of sampleTasks) {
        const exists = await Task.findOne({ title: task.title });
        if (exists) {
            console.log(`  Skipped (exists): ${task.title}`);
            continue;
        }
        await Task.create({
            ...task,
            status: "available",
            progressPercent: 0,
        });
        console.log(`  Created: ${task.title}  ($${(task.rewardCents / 100).toFixed(2)})`);
        inserted++;
    }
    console.log(`\nDone. ${inserted} new task(s) inserted.`);
    await mongoose_1.default.disconnect();
    process.exit(0);
}
seedTasks().catch((err) => {
    console.error("Seed failed:", err);
    mongoose_1.default.disconnect().catch(() => { });
    process.exit(1);
});
//# sourceMappingURL=seed-tasks.js.map