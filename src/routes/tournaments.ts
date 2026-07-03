import { Router, Request, Response, NextFunction } from "express";
import Tournament from "../models/Tournament";

const router = Router();

/**
 * GET /api/v1/tournaments
 * Returns active and coming-soon tournaments ordered by priority.
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const tournaments = await Tournament.find({
      status: { $in: ["active", "coming_soon"] },
    })
      .sort({ priority: -1, createdAt: -1 })
      .limit(limit)
      .select("-createdBy -updatedBy -__v")
      .lean();

    return res.json({ tournaments });
  } catch (err) {
    next(err);
  }
});

export default router;
