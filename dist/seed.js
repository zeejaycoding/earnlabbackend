"use strict";
/**
 * src/seed.ts
 *
 * Seed script to add sample offerwalls and bonus codes to the MongoDB database.
 *
 * Usage:
 *   - Set `MONGODB_URI` in your environment or .env file (defaults to mongodb://localhost:27017/earnlab)
 *   - Run with: `ts-node src/seed.ts` (or `npm run seed` if configured)
 *
 * This script is idempotent: it uses upserts to avoid creating duplicates when re-run.
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
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/earnlab';
/**
 * Schemas (kept minimal and matching the runtime models used by the app)
 */
const OfferwallSchema = new mongoose_1.Schema({
    name: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    metadata: { type: mongoose_1.Schema.Types.Mixed, required: false },
}, { timestamps: true });
const BonusCodeSchema = new mongoose_1.Schema({
    code: { type: String, required: true, unique: true, index: true },
    rewardCents: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: false, default: null },
    usesAllowed: { type: Number, required: true, default: 1 },
    usesCount: { type: Number, required: true, default: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } });
/**
 * Register models (reuse existing models if already registered)
 */
const Offerwall = mongoose_1.default.models.Offerwall || mongoose_1.default.model('Offerwall', OfferwallSchema);
const BonusCode = mongoose_1.default.models.BonusCode || mongoose_1.default.model('BonusCode', BonusCodeSchema);
/**
 * Sample data
 */
const sampleOfferwalls = [
    {
        name: 'CPA Offerwall',
        type: 'vertical',
        metadata: {
            description: 'Cost-per-action offers (installs, signups, trials).',
            sampleOffers: [
                { id: 'cpa1', title: 'Install App X', rewardCents: 50 },
                { id: 'cpa2', title: 'Register at Service Y', rewardCents: 100 },
            ],
        },
    },
    {
        name: 'SurveyWall',
        type: 'survey',
        metadata: {
            description: 'Surveys and market research offers.',
            sampleOffers: [
                { id: 's1', title: 'Short survey (5 min)', rewardCents: 75 },
                { id: 's2', title: 'Extended survey (15 min)', rewardCents: 200 },
            ],
        },
    },
    {
        name: 'Client Custom Offerwall',
        type: 'client',
        metadata: {
            description: 'Client-specific offers and promotions.',
            sampleOffers: [
                { id: 'client01', title: 'Sign up for Client A', rewardCents: 150 },
            ],
        },
    },
];
const now = new Date();
const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
const in365Days = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
const sampleBonusCodes = [
    {
        code: 'WELCOME10',
        rewardCents: 100, // $1.00
        expiresAt: in365Days,
        usesAllowed: 1000, // many uses (campaign-wide)
    },
    {
        code: 'ONETIME50',
        rewardCents: 50, // $0.50
        expiresAt: in30Days,
        usesAllowed: 1, // single-use code
    },
    {
        code: 'DAILY10',
        rewardCents: 10, // $0.10
        expiresAt: null,
        usesAllowed: 10000,
    },
];
/**
 * Upsert helpers
 */
async function upsertOfferwalls() {
    console.log('Seeding offerwalls...');
    for (const ow of sampleOfferwalls) {
        try {
            // use name+type as identity
            const filter = { name: ow.name, type: ow.type };
            const update = {
                $set: {
                    metadata: ow.metadata,
                },
            };
            await Offerwall.updateOne(filter, update, { upsert: true }).exec();
            console.log(`Upserted offerwall: ${ow.name} (${ow.type})`);
        }
        catch (err) {
            console.error(`Failed to upsert offerwall ${ow.name}:`, err);
        }
    }
}
async function upsertBonusCodes() {
    console.log('Seeding bonus codes...');
    for (const code of sampleBonusCodes) {
        try {
            const normalized = (code.code || '').trim().toUpperCase();
            const filter = { code: normalized };
            const update = {
                $set: {
                    rewardCents: code.rewardCents,
                    expiresAt: code.expiresAt || null,
                    usesAllowed: code.usesAllowed,
                },
                // ensure usesCount remains unchanged on re-seed (don't reset counters)
                $setOnInsert: {
                    usesCount: 0,
                },
            };
            await BonusCode.updateOne(filter, update, { upsert: true }).exec();
            console.log(`Upserted bonus code: ${normalized}`);
        }
        catch (err) {
            console.error(`Failed to upsert bonus code ${code.code}:`, err);
        }
    }
}
/**
 * Main entry
 */
async function main() {
    console.log(`Connecting to MongoDB: ${MONGODB_URI}`);
    try {
        await mongoose_1.default.connect(MONGODB_URI);
        console.log('Connected to MongoDB.');
        await upsertOfferwalls();
        await upsertBonusCodes();
        console.log('Seeding complete.');
        await mongoose_1.default.disconnect();
        process.exit(0);
    }
    catch (err) {
        console.error('Seeding failed:', err);
        try {
            await mongoose_1.default.disconnect();
        }
        catch { }
        process.exit(1);
    }
}
/* Only run main when this file is executed directly */
if (require.main === module) {
    main();
}
//# sourceMappingURL=seed.js.map