import { Router, Request, Response, NextFunction } from 'express';
import FeedEvent from '../models/FeedEvent';
import requireAuth from '../utils/requireAuth';

const router = Router();

/**
 * GET /api/v1/feed/activity
 * Returns recent feed events (live earnings, withdrawals)
 */
router.get('/activity', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // return the most recent 50 events
    let events = await FeedEvent.find({}).sort({ createdAt: -1 }).limit(50).lean().exec();

    // if empty, return some synthetic sample feed data
    if (!events || events.length === 0) {
      events = [
        { type: 'earning', text: 'Alice earned $0.50 from an offer', amountCents: 50, createdAt: new Date() },
        { type: 'withdrawal', text: 'Bob requested a $5.00 withdrawal', amountCents: 500, createdAt: new Date(Date.now() - 60000) },
      ] as any;
    }

    return res.json({ events });
  } catch (err) {
    next(err);
  }
});

/** optional: GET /api/v1/feed/my - return feed relevant to the authenticated user */
router.get('/my', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user as any;
    const events = await FeedEvent.find({ $or: [{ 'meta.user': user._id }, { type: 'announcement' }] }).sort({ createdAt: -1 }).limit(50).lean().exec();
    return res.json({ events });
  } catch (err) {
    next(err);
  }
});

export default router;
