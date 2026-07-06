import OfferLog from "../models/OfferLog";
import User from "../models/User";
import SystemSettings from "../models/SystemSettings";

export async function getDefaultHoldTimeDays(): Promise<number> {
  try {
    const settings = await SystemSettings.getSettings();
    return settings.defaultHoldTimeDays ?? 7;
  } catch {
    return 7;
  }
}

export function calculateHoldUntil(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export async function getHoldTimeDaysForUser(
  userId: string,
  offerHoldTimeDays?: number,
): Promise<number> {
  const user = await User.findById(userId).select("rewardHoldTimeDays").lean();
  if (user?.rewardHoldTimeDays != null) return user.rewardHoldTimeDays;
  if (offerHoldTimeDays != null) return offerHoldTimeDays;
  return getDefaultHoldTimeDays();
}

export async function releaseExpiredHolds(): Promise<number> {
  const now = new Date();
  const heldLogs = await OfferLog.find({
    status: "held",
    holdUntil: { $lte: now },
  }).exec();

  let releasedCount = 0;

  for (const log of heldLogs) {
    try {
      const user = await User.findById(log.user).exec();
      if (!user) continue;

      const pending = user.pendingBalanceCents || 0;
      if (pending < log.amountCents) continue;

      user.pendingBalanceCents = pending - log.amountCents;
      user.balanceCents = (user.balanceCents || 0) + log.amountCents;
      user.totalEarned = (user.totalEarned || 0) + log.amountCents;
      await user.save();

      log.status = "approved";
      log.approvedAt = new Date();
      await log.save();

      releasedCount++;
    } catch (err) {
      console.error("Failed to release hold for OfferLog", log._id, err);
    }
  }

  return releasedCount;
}
