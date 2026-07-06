"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultHoldTimeDays = getDefaultHoldTimeDays;
exports.calculateHoldUntil = calculateHoldUntil;
exports.getHoldTimeDaysForUser = getHoldTimeDaysForUser;
exports.releaseExpiredHolds = releaseExpiredHolds;
const OfferLog_1 = __importDefault(require("../models/OfferLog"));
const User_1 = __importDefault(require("../models/User"));
const SystemSettings_1 = __importDefault(require("../models/SystemSettings"));
async function getDefaultHoldTimeDays() {
    try {
        const settings = await SystemSettings_1.default.getSettings();
        return settings.defaultHoldTimeDays ?? 30;
    }
    catch {
        return 30;
    }
}
function calculateHoldUntil(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
}
async function getHoldTimeDaysForUser(userId, offerHoldTimeDays) {
    const user = await User_1.default.findById(userId).select("rewardHoldTimeDays").lean();
    if (user?.rewardHoldTimeDays != null)
        return user.rewardHoldTimeDays;
    if (offerHoldTimeDays != null)
        return offerHoldTimeDays;
    return getDefaultHoldTimeDays();
}
async function releaseExpiredHolds() {
    const now = new Date();
    const heldLogs = await OfferLog_1.default.find({
        status: "held",
        holdUntil: { $lte: now },
    }).exec();
    let releasedCount = 0;
    for (const log of heldLogs) {
        try {
            const user = await User_1.default.findById(log.user).exec();
            if (!user)
                continue;
            const pending = user.pendingBalanceCents || 0;
            if (pending < log.amountCents)
                continue;
            user.pendingBalanceCents = pending - log.amountCents;
            user.balanceCents = (user.balanceCents || 0) + log.amountCents;
            user.totalEarned = (user.totalEarned || 0) + log.amountCents;
            await user.save();
            log.status = "approved";
            log.approvedAt = new Date();
            await log.save();
            releasedCount++;
        }
        catch (err) {
            console.error("Failed to release hold for OfferLog", log._id, err);
        }
    }
    return releasedCount;
}
//# sourceMappingURL=rewardHoldService.js.map