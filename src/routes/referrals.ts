import { Router, Request, Response, NextFunction } from 'express';
import requireAuth from '../utils/requireAuth';
import User from '../models/User';
import ReferralEarning from '../models/ReferralEarning';

const router = Router();

/**
 * GET /api/v1/user/referrals
 * Returns referral link, basic stats and total earned
 */
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user as any;

    const affiliateCode = user.affiliateCode || null;
    const referralLink = affiliateCode ? `${process.env.FRONTEND_BASE_URL || 'https://earnlab.example'}/join?ref=${affiliateCode}` : null;

    // aggregate referral earnings
    const totalEarnedAgg = await ReferralEarning.aggregate([
      { $match: { referrer: user._id, claimed: true } },
      { $group: { _id: null, total: { $sum: '$amountCents' } } },
    ]).exec();
    const totalEarned = (totalEarnedAgg[0] && totalEarnedAgg[0].total) || 0;

    const availableAgg = await ReferralEarning.aggregate([
      { $match: { referrer: user._id, claimed: false } },
      { $group: { _id: null, total: { $sum: '$amountCents' }, count: { $sum: 1 } } },
    ]).exec();
    const available = (availableAgg[0] && availableAgg[0].total) || 0;
    const pendingCount = (availableAgg[0] && availableAgg[0].count) || 0;

    return res.json({ affiliateCode, referralLink, totalEarnedCents: totalEarned, availableCents: available, pendingCount });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/user/referrals/claim
 * Claims available referral earnings (moves to user balance and marks earnings claimed)
 */
router.post('/claim', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user as any;

    const earnings = await ReferralEarning.find({ referrer: user._id, claimed: false }).exec();
    if (!earnings || earnings.length === 0) {
      return res.status(400).json({ message: 'No referral earnings available to claim' });
    }

    const total = earnings.reduce((s, e: any) => s + e.amountCents, 0);

    // mark claimed
    await ReferralEarning.updateMany({ referrer: user._id, claimed: false }, { $set: { claimed: true } }).exec();

    // add to user balance
    user.balanceCents = (user.balanceCents || 0) + total;
    await user.save();

    return res.json({ claimedCents: total, newBalanceCents: user.balanceCents });
  } catch (err) {
    next(err);
  }
});

export default router;
