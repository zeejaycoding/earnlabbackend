import { Router, Request, Response, NextFunction } from "express";
import dayjs from "dayjs";
import User from "../models/User";

const router = Router();

// middleware copied from user route for auth verification
import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET || "please-change-this-secret";

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.header("authorization");
    if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ message: "Missing Authorization" });
    const token = auth.slice(7).trim();
    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET) as any;
    } catch (err) {
      return res.status(401).json({ message: "Invalid token" });
    }
    const user = await User.findById(payload.sub).exec();
    if (!user) return res.status(401).json({ message: "User not found" });
    (req as any).user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/rewards/streaks
 * Returns a 7-day streak box definition for the user with claimable status
 */
router.get("/streaks", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user: any = (req as any).user;
    const lastClaimed = user.lastDailyCheckin ? new Date(user.lastDailyCheckin) : null;
    const today = dayjs().startOf("day");
    const eligible = !lastClaimed || dayjs(lastClaimed).isBefore(today);

    // Build 7-day boxes; imageKey is a logical name front-end can map to a local asset
    const boxes = Array.from({ length: 7 }).map((_, i) => {
      const day = i + 1;
      // claimable only for the current next day in the streak if eligible and day equals streakDays+1
      const nextDay = (user.streakDays || 0) + 1;
      const claimable = eligible && day === nextDay;
      return {
        day,
        title: `Day ${day}`,
        imageKey: `streak-box-${day}`,
        claimable,
      };
    });

    return res.json({ boxes, eligible, streakDays: user.streakDays || 0, lastClaimedAt: lastClaimed });
  } catch (err) {
    next(err);
  }
});

export default router;
