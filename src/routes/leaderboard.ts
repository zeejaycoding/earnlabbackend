import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
// Import models to ensure they're registered
import '../models/User';
import '../models/Task';

const router = Router();

/**
 * GET /api/v1/leaderboard/monthly
 * Returns top users by earnings for the current month
 */
router.get('/monthly', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get start and end of current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Get models from mongoose registry
    const Task = mongoose.models.Task;
    const User = mongoose.models.User;

    // Aggregate earnings by user for this month
    const monthlyEarnings = await Task.aggregate([
      {
        $match: {
          status: 'completed',
          completedAt: {
            $gte: startOfMonth,
            $lte: endOfMonth,
          },
        },
      },
      {
        $group: {
          _id: '$user',
          totalEarnings: { $sum: '$rewardCents' },
          tasksCompleted: { $sum: 1 },
        },
      },
      {
        $sort: { totalEarnings: -1 },
      },
      {
        $limit: 50, // Top 50 users
      },
    ]);

    // Populate user details
    const leaderboardWithUsers = await Promise.all(
      monthlyEarnings.map(async (entry: any) => {
        const user = await User.findById(entry._id).select('username displayName avatarUrl profilePrivacy');
        
        // Respect privacy settings
        if (!user || (user as any).profilePrivacy === 'private') {
          return {
            username: 'Anonymous',
            name: 'Anonymous',
            score: entry.totalEarnings,
            points: entry.totalEarnings,
            tasksCompleted: entry.tasksCompleted,
            isPrivate: true,
          };
        }

        return {
          userId: user._id,
          username: user.username || 'Anonymous',
          name: user.displayName || user.username || 'Anonymous',
          score: entry.totalEarnings,
          points: entry.totalEarnings,
          tasksCompleted: entry.tasksCompleted,
          avatarUrl: user.avatarUrl || null,
          isPrivate: false,
        };
      })
    );

    return res.json({
      leaders: leaderboardWithUsers,
      month: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
      startDate: startOfMonth,
      endDate: endOfMonth,
    });
  } catch (err) {
    console.error('Error fetching monthly leaderboard:', err);
    next(err);
  }
});

/**
 * GET /api/v1/leaderboard/all-time
 * Returns top users by all-time earnings
 */
router.get('/all-time', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get models from mongoose registry
    const User = mongoose.models.User;

    // Get top users by balance
    const topUsers = await User.find()
      .select('username displayName avatarUrl balanceCents profilePrivacy')
      .sort({ balanceCents: -1 })
      .limit(50);

    const leaders = topUsers.map((user: any) => {
      // Respect privacy settings
      if ((user as any).profilePrivacy === 'private') {
        return {
          username: 'Anonymous',
          name: 'Anonymous',
          score: user.balanceCents || 0,
          points: user.balanceCents || 0,
          isPrivate: true,
        };
      }

      return {
        userId: user._id,
        username: user.username || 'Anonymous',
        name: user.displayName || user.username || 'Anonymous',
        score: user.balanceCents || 0,
        points: user.balanceCents || 0,
        avatarUrl: user.avatarUrl || null,
        isPrivate: false,
      };
    });

    return res.json({
      leaders,
      type: 'all-time',
    });
  } catch (err) {
    console.error('Error fetching all-time leaderboard:', err);
    next(err);
  }
});

/**
 * GET /api/v1/leaderboard/weekly
 * Returns top users by earnings for the current week
 */
router.get('/weekly', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get start and end of current week (Monday to Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Get models from mongoose registry
    const Task = mongoose.models.Task;
    const User = mongoose.models.User;

    // Aggregate earnings by user for this week
    const weeklyEarnings = await Task.aggregate([
      {
        $match: {
          status: 'completed',
          completedAt: {
            $gte: startOfWeek,
            $lte: endOfWeek,
          },
        },
      },
      {
        $group: {
          _id: '$user',
          totalEarnings: { $sum: '$rewardCents' },
          tasksCompleted: { $sum: 1 },
        },
      },
      {
        $sort: { totalEarnings: -1 },
      },
      {
        $limit: 50,
      },
    ]);

    // Populate user details
    const leaderboardWithUsers = await Promise.all(
      weeklyEarnings.map(async (entry: any) => {
        const user = await User.findById(entry._id).select('username displayName avatarUrl profilePrivacy');
        
        // Respect privacy settings
        if (!user || (user as any).profilePrivacy === 'private') {
          return {
            username: 'Anonymous',
            name: 'Anonymous',
            score: entry.totalEarnings,
            points: entry.totalEarnings,
            tasksCompleted: entry.tasksCompleted,
            isPrivate: true,
          };
        }

        return {
          userId: user._id,
          username: user.username || 'Anonymous',
          name: user.displayName || user.username || 'Anonymous',
          score: entry.totalEarnings,
          points: entry.totalEarnings,
          tasksCompleted: entry.tasksCompleted,
          avatarUrl: user.avatarUrl || null,
          isPrivate: false,
        };
      })
    );

    return res.json({
      leaders: leaderboardWithUsers,
      week: `Week of ${startOfWeek.toLocaleDateString()}`,
      startDate: startOfWeek,
      endDate: endOfWeek,
    });
  } catch (err) {
    console.error('Error fetching weekly leaderboard:', err);
    next(err);
  }
});

export default router;
