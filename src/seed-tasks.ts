/**
 * src/seed-tasks.ts
 *
 * Seed script to add sample tasks to the MongoDB database.
 *
 * Usage:
 *   - Run with: `ts-node src/seed-tasks.ts`
 */

import dotenv from "dotenv";
import mongoose, { Schema, Document, Model } from "mongoose";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/earnlab";

interface ITask extends Document {
  title: string;
  description: string | null;
  type: string;
  rewardCents: number;
  user: mongoose.Types.ObjectId | null;
  externalId: string | null;
  status: string;
  progressPercent: number;
  metadata: Record<string, any> | null;
  availableFrom: Date | null;
  expiresAt: Date | null;
  completedAt: Date | null;
}

const TaskSchema = new Schema<ITask>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    type: { type: String, default: "one-time" },
    rewardCents: { type: Number, required: true, default: 0, min: 0 },
    user: { type: Schema.Types.ObjectId, ref: "User", default: null },
    externalId: { type: String, default: null },
    status: { type: String, default: "available" },
    progressPercent: { type: Number, default: 0 },
    metadata: { type: Schema.Types.Mixed, default: null },
    availableFrom: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Task: Model<ITask> =
  mongoose.models.Task || mongoose.model<ITask>("Task", TaskSchema);

const now = new Date();
const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

const sampleTasks = [
  {
    title: "Install & Try AppDemo",
    description:
      "Download AppDemo from the App Store or Play Store, install it, and open it once to earn your reward.",
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
    description:
      "Create a free account on StreamFlix and verify your email address to complete this task.",
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
    description:
      "Answer a quick 5-minute survey about your shopping habits and earn instantly.",
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
    description:
      "Log in to your Earnlab account every day this week. Rewards increase each consecutive day!",
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
    description:
      "Share your referral link with 3 friends. Once they sign up and complete their first task, you earn a bonus.",
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
    description:
      "Download GameRush, create an account, and play until you reach level 5. Progress is tracked automatically.",
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
    description:
      "Watch a 2-minute product video on our partner site and leave a quick rating to earn rewards.",
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
    description:
      "Sign up for Freebird Rides using the link below and take your first ride within 7 days.",
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
    description:
      "Fill out your profile details including name, bio, and profile picture to unlock badge rewards.",
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
    description:
      "Share your opinion in this detailed market research survey. Takes about 10 minutes to complete.",
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
  await mongoose.connect(MONGODB_URI);
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
  await mongoose.disconnect();
  process.exit(0);
}

seedTasks().catch((err) => {
  console.error("Seed failed:", err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
