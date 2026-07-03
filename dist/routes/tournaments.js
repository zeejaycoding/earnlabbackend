"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Tournament_1 = __importDefault(require("../models/Tournament"));
const router = (0, express_1.Router)();
/**
 * GET /api/v1/tournaments
 * Returns active and coming-soon tournaments ordered by priority.
 */
router.get("/", async (req, res, next) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 10, 50);
        const tournaments = await Tournament_1.default.find({
            status: { $in: ["active", "coming_soon"] },
        })
            .sort({ priority: -1, createdAt: -1 })
            .limit(limit)
            .select("-createdBy -updatedBy -__v")
            .lean();
        return res.json({ tournaments });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=tournaments.js.map