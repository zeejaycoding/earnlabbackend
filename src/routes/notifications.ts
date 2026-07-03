import { Router, Request, Response, NextFunction } from 'express';
import requireAuth from '../utils/requireAuth';
import Notification from '../models/Notification';

const router = Router();

/** GET /api/v1/user/notifications */
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user as any;
    const notifications = await Notification.find({ user: user._id }).sort({ createdAt: -1 }).lean().exec();
    return res.json({ notifications });
  } catch (err) {
    next(err);
  }
});

/** POST /api/v1/user/notifications/read */
router.post('/read', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user as any;
    const ids = req.body.ids as string[] | undefined;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      // mark all as read
      await Notification.updateMany({ user: user._id, read: false }, { $set: { read: true } }).exec();
        // emit update to user socket room
        try {
          const io = (req.app as any).locals?.io;
          if (io) io.to(`user:${user._id}`).emit('notifications:read', { all: true });
        } catch {}
        return res.json({ message: 'All notifications marked read' });
    }

    await Notification.updateMany({ user: user._id, _id: { $in: ids } }, { $set: { read: true } }).exec();
    try {
      const io = (req.app as any).locals?.io;
      if (io) io.to(`user:${user._id}`).emit('notifications:read', { ids });
    } catch {}
    return res.json({ message: 'Selected notifications marked read', count: ids.length });
  } catch (err) {
    next(err);
  }
});

export default router;
