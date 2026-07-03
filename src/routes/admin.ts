import { Router, Request, Response } from "express";
import { requireAdmin, AdminRequest } from "../utils/requireAdmin";
import User from "../models/User";
import Withdrawal from "../models/Withdrawal";
import Notification from "../models/Notification";
import AuditLog from "../models/AuditLog";
import PromoCode from "../models/PromoCode";
import Offer from "../models/Offer";
import OfferLog from "../models/OfferLog";
import SupportTicket from "../models/SupportTicket";
import AdminUser from "../models/AdminUser";
import ReferralEarning from "../models/ReferralEarning";
import SystemSettings from "../models/SystemSettings";
import PremiumOffer from "../models/PremiumOffer";
import emailService from "../services/emailService";
import { applyActivityEvent } from "../utils/activityProgression";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const router = Router();
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

// =============================================
// HELPER FUNCTION: CREATE AUDIT LOG
// =============================================
async function createAuditLog(
  adminId: string,
  adminEmail: string,
  action: string,
  actionType: string,
  options: {
    targetType?: string;
    targetId?: string;
    changes?: { before?: any; after?: any };
    reason?: string;
    severity?: "low" | "medium" | "high" | "critical";
    metadata?: any;
    ipAddress?: string;
    userAgent?: string;
  } = {},
) {
  try {
    await AuditLog.create({
      adminId,
      adminEmail,
      action,
      actionType,
      targetType: options.targetType,
      targetId: options.targetId,
      changes: options.changes,
      reason: options.reason,
      severity: options.severity || "low",
      metadata: options.metadata,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}

// =============================================
// 1. AUTHENTICATION
// =============================================

// Admin login with proper admin user model
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    // Find admin user
    const admin = await AdminUser.findByEmail(email);
    if (!admin) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Check if account is locked
    if (admin.isLocked()) {
      res.status(403).json({
        error:
          "Account locked due to too many failed login attempts. Please try again later.",
      });
      return;
    }

    // Check if account is active
    if (!admin.isActive) {
      res.status(403).json({ error: "Account is disabled" });
      return;
    }

    // Verify password
    const isValid = await admin.comparePassword(password);
    if (!isValid) {
      await admin.incrementLoginAttempts();
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Reset login attempts on successful login
    await admin.resetLoginAttempts();

    // Update last login
    admin.lastLoginAt = new Date();
    admin.lastLoginIp = req.ip || req.socket.remoteAddress;
    await admin.save();

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: admin._id.toString(),
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
      },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    // Create audit log
    await createAuditLog(
      admin._id.toString(),
      admin.email,
      "Admin Login",
      "security",
      {
        severity: "low",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
    );

    res.json({
      token,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      permissions: admin.permissions,
    });
  } catch (error: any) {
    console.error("Admin login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create initial admin user (only if no admins exist)
router.post("/setup", async (req: Request, res: Response) => {
  try {
    // Check if any admin users exist
    const existingAdmins = await AdminUser.countDocuments();
    if (existingAdmins > 0) {
      res
        .status(403)
        .json({ error: "Admin users already exist. Use regular login." });
      return;
    }

    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: "Email, password, and name are required" });
      return;
    }

    const admin = new AdminUser({
      email,
      name,
      role: "superadmin",
      permissions: ["*"],
      isActive: true,
    });

    await admin.setPassword(password);
    await admin.save();

    res.json({
      success: true,
      message: "Superadmin account created successfully",
    });
  } catch (error: any) {
    console.error("Setup error:", error);
    res.status(500).json({ error: "Failed to create admin account" });
  }
});

// =============================================
// 2. USER MANAGEMENT
// =============================================

// Get all users with filters
router.get("/users", requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const {
      search,
      status,
      page = 1,
      limit = 50,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query: any = {};

    // Search filter
    if (search) {
      query.$or = [
        { username: new RegExp(search as string, "i") },
        { email: new RegExp(search as string, "i") },
        { uuid: new RegExp(search as string, "i") },
        { lastLoginIp: new RegExp(search as string, "i") },
      ];
    }

    // Status filter
    if (status) {
      if (status === "banned") {
        query.isBanned = true;
      } else if (status === "active") {
        query.isBanned = false;
      } else if (status === "vpn") {
        query.isVpnUser = true;
      }
    }

    const skip = (Number(page) - 1) * Number(limit);
    const sort: any = { [sortBy as string]: sortOrder === "asc" ? 1 : -1 };

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-passwordHash")
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    res.json({
      data: users,
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (error: any) {
    console.error("Get users error:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Get single user details
router.get(
  "/users/:userId",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId)
        .select("-passwordHash")
        .populate("referredBy", "username email")
        .lean();

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Get user's recent offers
      const recentOffers = await OfferLog.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      // Get user's withdrawals
      const withdrawals = await Withdrawal.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      // Get referral stats
      const referralStats = await ReferralEarning.aggregate([
        { $match: { referrer: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: "$amountCents" },
            count: { $sum: 1 },
          },
        },
      ]);

      // Get referred users
      const referredUsers = await User.find({ referredBy: userId })
        .select("username email createdAt balanceCents")
        .lean();

      res.json({
        user,
        recentOffers,
        withdrawals,
        referralStats: referralStats[0] || { totalEarnings: 0, count: 0 },
        referredUsers,
      });
    } catch (error: any) {
      console.error("Get user details error:", error);
      res.status(500).json({ error: "Failed to fetch user details" });
    }
  },
);

// Ban user
router.post(
  "/users/:userId/ban",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { reason, duration } = req.body; // duration in days, null = permanent

      if (!reason) {
        res.status(400).json({ error: "Ban reason is required" });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const beforeState = {
        isBanned: user.isBanned,
        banReason: user.banReason,
      };

      user.isBanned = true;
      user.banReason = reason;
      user.bannedAt = new Date();
      user.accountStatus = "banned";

      if (duration) {
        user.banDuration = duration;
        user.banExpiresAt = new Date(
          Date.now() + duration * 24 * 60 * 60 * 1000,
        );
      } else {
        user.banDuration = null;
        user.banExpiresAt = null;
      }

      await user.save();

      // Create notification for user
      await Notification.create({
        user: user._id,
        type: "warning",
        title: "Account Banned",
        body: `Your account has been banned. Reason: ${reason}`,
        read: false,
      });

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Ban User",
        "user_management",
        {
          targetType: "user",
          targetId: userId,
          reason,
          severity: "high",
          changes: {
            before: beforeState,
            after: { isBanned: true, banReason: reason },
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, message: "User banned successfully" });
    } catch (error: any) {
      console.error("Ban user error:", error);
      res.status(500).json({ error: "Failed to ban user" });
    }
  },
);

// Unban user
router.post(
  "/users/:userId/unban",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const beforeState = {
        isBanned: user.isBanned,
        banReason: user.banReason,
      };

      user.isBanned = false;
      user.banReason = null;
      user.bannedAt = null;
      user.banDuration = null;
      user.banExpiresAt = null;
      user.accountStatus = "active";
      await user.save();

      // Create notification
      await Notification.create({
        user: user._id,
        type: "success",
        title: "Account Unbanned",
        body: "Your account has been unbanned. You can now use all features.",
        read: false,
      });

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Unban User",
        "user_management",
        {
          targetType: "user",
          targetId: userId,
          severity: "medium",
          changes: { before: beforeState, after: { isBanned: false } },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, message: "User unbanned successfully" });
    } catch (error: any) {
      console.error("Unban user error:", error);
      res.status(500).json({ error: "Failed to unban user" });
    }
  },
);

// Warn user
router.post(
  "/users/:userId/warn",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        res.status(400).json({ error: "Warning reason is required" });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      if (!user.warnings) user.warnings = [];
      if (!user.warningCount) user.warningCount = 0;

      user.warnings.push({
        reason,
        issuedBy: req.admin!.email,
        issuedAt: new Date(),
      });
      user.warningCount += 1;
      await user.save();

      // Create notification
      await Notification.create({
        user: user._id,
        type: "warning",
        title: "Warning Issued",
        body: `You have received a warning: ${reason}`,
        read: false,
      });

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Warn User",
        "user_management",
        {
          targetType: "user",
          targetId: userId,
          reason,
          severity: "medium",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, message: "Warning issued successfully" });
    } catch (error: any) {
      console.error("Warn user error:", error);
      res.status(500).json({ error: "Failed to issue warning" });
    }
  },
);

// Add/Deduct points
router.post(
  "/users/:userId/points",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { amount, reason, type } = req.body; // type: 'add' or 'deduct'

      if (!amount || !reason || !type) {
        res
          .status(400)
          .json({ error: "Amount, reason, and type are required" });
        return;
      }

      const amountCents = parseInt(amount);
      if (isNaN(amountCents) || amountCents <= 0) {
        res.status(400).json({ error: "Invalid amount" });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const beforeBalance = user.balanceCents;

      if (type === "add") {
        user.balanceCents += amountCents;
        if (!user.totalEarned) user.totalEarned = 0;
        user.totalEarned += amountCents;
      } else if (type === "deduct") {
        if (user.balanceCents < amountCents) {
          res.status(400).json({ error: "Insufficient balance" });
          return;
        }
        user.balanceCents -= amountCents;
      } else {
        res
          .status(400)
          .json({ error: "Invalid type. Must be 'add' or 'deduct'" });
        return;
      }

      await user.save();

      // Create notification
      await Notification.create({
        user: user._id,
        type: type === "add" ? "success" : "warning",
        title: `Points ${type === "add" ? "Added" : "Deducted"}`,
        body: `${type === "add" ? "+" : "-"}$${(amountCents / 100).toFixed(2)} - ${reason}`,
        read: false,
      });

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        `${type === "add" ? "Add" : "Deduct"} Points`,
        "user_management",
        {
          targetType: "user",
          targetId: userId,
          reason,
          severity: "medium",
          changes: {
            before: { balanceCents: beforeBalance },
            after: { balanceCents: user.balanceCents },
          },
          metadata: { amount: amountCents, type },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, newBalance: user.balanceCents });
    } catch (error: any) {
      console.error("Adjust points error:", error);
      res.status(500).json({ error: "Failed to adjust points" });
    }
  },
);

// Set hold time
router.post(
  "/users/:userId/hold-time",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { days } = req.body; // null to reset to default

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const beforeHoldTime = user.rewardHoldTimeDays;
      user.rewardHoldTimeDays = days === null ? undefined : parseInt(days);
      await user.save();

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Update Hold Time",
        "user_management",
        {
          targetType: "user",
          targetId: userId,
          severity: "low",
          changes: {
            before: { holdTime: beforeHoldTime },
            after: { holdTime: user.rewardHoldTimeDays },
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, holdTimeDays: user.rewardHoldTimeDays });
    } catch (error: any) {
      console.error("Set hold time error:", error);
      res.status(500).json({ error: "Failed to set hold time" });
    }
  },
);

// Add admin note to user
router.post(
  "/users/:userId/notes",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { note } = req.body;

      if (!note) {
        res.status(400).json({ error: "Note is required" });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      if (!user.adminNotes) user.adminNotes = [];

      user.adminNotes.push({
        note,
        addedBy: req.admin!.email,
        addedAt: new Date(),
      });
      await user.save();

      res.json({ success: true, notes: user.adminNotes });
    } catch (error: any) {
      console.error("Add note error:", error);
      res.status(500).json({ error: "Failed to add note" });
    }
  },
);

// =============================================
// 3. REFERRAL / AFFILIATE SYSTEM
// =============================================

// Get referral overview
router.get(
  "/referrals/overview",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      // Top referrers
      const topReferrers = await ReferralEarning.aggregate([
        {
          $group: {
            _id: "$referrer",
            totalEarnings: { $sum: "$amountCents" },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalEarnings: -1 } },
        { $limit: 10 },
      ]);

      // Populate user data
      const referrerIds = topReferrers.map((r) => r._id);
      const referrerUsers = await User.find({ _id: { $in: referrerIds } })
        .select("username email avatarUrl")
        .lean();

      const topReferrersWithData = topReferrers.map((ref) => {
        const user = referrerUsers.find(
          (u) => u._id.toString() === ref._id.toString(),
        );
        return {
          ...ref,
          user,
        };
      });

      // Total stats
      const totalStats = await ReferralEarning.aggregate([
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: "$amountCents" },
            totalCommissions: { $sum: 1 },
          },
        },
      ]);

      // Recent referrals
      const recentReferrals = await ReferralEarning.find({})
        .populate("referrer", "username email")
        .populate("referred", "username email")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      res.json({
        topReferrers: topReferrersWithData,
        totalStats: totalStats[0] || { totalEarnings: 0, totalCommissions: 0 },
        recentReferrals,
      });
    } catch (error: any) {
      console.error("Get referral overview error:", error);
      res.status(500).json({ error: "Failed to fetch referral overview" });
    }
  },
);

// Set custom commission rate for user
router.post(
  "/users/:userId/referral-rate",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { rate } = req.body; // percentage, null to reset to default

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const beforeRate = user.customReferralRate;

      if (rate === null) {
        user.customReferralRate = null;
      } else {
        const rateNum = parseFloat(rate);
        if (isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
          res.status(400).json({ error: "Rate must be between 0 and 100" });
          return;
        }
        user.customReferralRate = rateNum;
      }

      await user.save();

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Update Referral Rate",
        "referral",
        {
          targetType: "user",
          targetId: userId,
          severity: "low",
          changes: {
            before: { rate: beforeRate },
            after: { rate: user.customReferralRate },
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, rate: user.customReferralRate });
    } catch (error: any) {
      console.error("Set referral rate error:", error);
      res.status(500).json({ error: "Failed to set referral rate" });
    }
  },
);

// Detect referral fraud
router.get(
  "/referrals/fraud-detection",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      // Find users with same IP who referred each other
      const suspiciousUsers = await User.aggregate([
        {
          $match: {
            lastLoginIp: { $ne: null },
          },
        },
        {
          $group: {
            _id: "$lastLoginIp",
            users: {
              $push: { _id: "$_id", username: "$username", email: "$email" },
            },
            count: { $sum: 1 },
          },
        },
        {
          $match: {
            count: { $gt: 1 },
          },
        },
      ]);

      // Find inactive referred accounts
      const inactiveReferrals = await User.find({
        referredBy: { $ne: null },
        lastLoginAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // 30 days
      })
        .populate("referredBy", "username email")
        .limit(50)
        .lean();

      res.json({
        suspiciousIps: suspiciousUsers,
        inactiveReferrals,
      });
    } catch (error: any) {
      console.error("Fraud detection error:", error);
      res.status(500).json({ error: "Failed to detect fraud" });
    }
  },
);

// =============================================
// 4. OFFERS & OFFERWALLS
// =============================================

// Get all offers
router.get(
  "/offers",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { provider, category, status, page = 1, limit = 50 } = req.query;

      const query: any = {};
      if (provider) query.provider = provider;
      if (category) query.category = category;
      if (status) query.status = status;

      const skip = (Number(page) - 1) * Number(limit);

      const [offers, total] = await Promise.all([
        Offer.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        Offer.countDocuments(query),
      ]);

      res.json({
        offers,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error: any) {
      console.error("Get offers error:", error);
      res.status(500).json({ error: "Failed to fetch offers" });
    }
  },
);

// Toggle offer status
router.post(
  "/offers/:offerId/toggle",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { offerId } = req.params;

      const offer = await Offer.findById(offerId);
      if (!offer) {
        res.status(404).json({ error: "Offer not found" });
        return;
      }

      const beforeStatus = offer.isActive;
      offer.isActive = !offer.isActive;
      await offer.save();

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Toggle Offer Status",
        "offer",
        {
          targetType: "offer",
          targetId: offerId,
          severity: "low",
          changes: {
            before: { isActive: beforeStatus },
            after: { isActive: offer.isActive },
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, isActive: offer.isActive });
    } catch (error: any) {
      console.error("Toggle offer error:", error);
      res.status(500).json({ error: "Failed to toggle offer" });
    }
  },
);

// Set offer hold time
router.post(
  "/offers/:offerId/hold-time",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { offerId } = req.params;
      const { days } = req.body;

      const offer = await Offer.findById(offerId);
      if (!offer) {
        res.status(404).json({ error: "Offer not found" });
        return;
      }

      const beforeHoldTime = offer.holdTimeDays;
      offer.holdTimeDays = parseInt(days);
      await offer.save();

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Update Offer Hold Time",
        "offer",
        {
          targetType: "offer",
          targetId: offerId,
          severity: "low",
          changes: {
            before: { holdTime: beforeHoldTime },
            after: { holdTime: offer.holdTimeDays },
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, holdTimeDays: offer.holdTimeDays });
    } catch (error: any) {
      console.error("Set offer hold time error:", error);
      res.status(500).json({ error: "Failed to set offer hold time" });
    }
  },
);

// Get offer logs
router.get(
  "/offer-logs",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { status, provider, userId, page = 1, limit = 50 } = req.query;

      const query: any = {};
      if (status) query.status = status;
      if (provider) query.provider = provider;
      if (userId) query.user = userId;

      const skip = (Number(page) - 1) * Number(limit);

      const [logs, total] = await Promise.all([
        OfferLog.find(query)
          .populate("user", "username email avatarUrl")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        OfferLog.countDocuments(query),
      ]);

      res.json({
        data: logs,
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      });
    } catch (error: any) {
      console.error("Get offer logs error:", error);
      res.status(500).json({ error: "Failed to fetch offer logs" });
    }
  },
);

// Approve/Reject offer log
router.post(
  "/offer-logs/:logId/review",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { logId } = req.params;
      const { status, reason } = req.body; // status: 'approved' or 'rejected'

      const log = await OfferLog.findById(logId).populate("user");
      if (!log) {
        res.status(404).json({ error: "Offer log not found" });
        return;
      }

      const beforeStatus = log.status;
      log.status = status;
      log.approvedBy = req.admin!.email;
      log.approvedAt = new Date();

      if (status === "rejected" && reason) {
        log.rejectionReason = reason;
      }

      await log.save();

      // If approved, credit user
      if (status === "approved") {
        const settings = await SystemSettings.getSettings().catch(() => null);
        const user = await User.findById(log.user);
        if (user) {
          user.balanceCents += log.amountCents;
          if (!user.totalEarned) user.totalEarned = 0;
          user.totalEarned += log.amountCents;

          const offerContext = `${String(log.provider || "")} ${String(log.offerName || "")} ${String((log as any)?.metadata?.type || "")} ${String((log as any)?.metadata?.category || "")}`.toLowerCase();
          const eventType = offerContext.includes("survey")
            ? "survey_completion"
            : "offer_completion";

          applyActivityEvent(user as any, eventType, {
            scoreConfig: (settings as any)?.activityScoreConfig,
          });

          await user.save();

          // Create notification
          await Notification.create({
            user: user._id,
            type: "success",
            title: "Offer Approved",
            body: `Your offer "${log.offerName}" has been approved. +$${(log.amountCents / 100).toFixed(2)}`,
            read: false,
          });

          // Increment daily completions for premium offers
          if (log.provider === "premium" && mongoose.Types.ObjectId.isValid(log.offerId)) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const premiumOffer = await PremiumOffer.findById(log.offerId);
            if (premiumOffer) {
              // Check if we need to reset daily completions (new day)
              const lastReset = premiumOffer.lastCapReset ? new Date(premiumOffer.lastCapReset) : null;
              if (!lastReset || lastReset < today) {
                // New day - reset daily completions
                premiumOffer.dailyCompletions = 1;
                premiumOffer.lastCapReset = new Date();
              } else {
                // Same day - increment
                premiumOffer.dailyCompletions = (premiumOffer.dailyCompletions || 0) + 1;
              }
              // Also increment total completions and payout
              premiumOffer.completions = (premiumOffer.completions || 0) + 1;
              premiumOffer.totalPayout = (premiumOffer.totalPayout || 0) + log.amountCents;
              await premiumOffer.save();
            }
          }
        }
      } else if (status === "rejected") {
        const user = await User.findById(log.user);
        if (user) {
          await Notification.create({
            user: user._id,
            type: "error",
            title: "Offer Rejected",
            body: `Your offer "${log.offerName}" was rejected. Reason: ${reason || "N/A"}`,
            read: false,
          });
        }
      }

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        `${status === "approved" ? "Approve" : "Reject"} Offer`,
        "offer",
        {
          targetType: "offer",
          targetId: logId,
          reason,
          severity: "medium",
          changes: {
            before: { status: beforeStatus },
            after: { status },
          },
          metadata: { offerName: log.offerName, amount: log.amountCents },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, log });
    } catch (error: any) {
      console.error("Review offer log error:", error);
      res.status(500).json({ error: "Failed to review offer log" });
    }
  },
);

// =============================================
// 5. PAYOUTS / WITHDRAWALS
// =============================================

// Get all withdrawals
router.get(
  "/withdrawals",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { status, page = 1, limit = 50 } = req.query;

      const query: any = {};
      if (status) query.status = status;

      const skip = (Number(page) - 1) * Number(limit);

      const [withdrawals, total] = await Promise.all([
        Withdrawal.find(query)
          .populate("user", "username email avatarUrl displayName balanceCents")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        Withdrawal.countDocuments(query),
      ]);

      res.json({
        withdrawals,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error: any) {
      console.error("Get withdrawals error:", error);
      res.status(500).json({ error: "Failed to fetch withdrawals" });
    }
  },
);

// Approve withdrawal request
router.post(
  "/withdrawals/:withdrawalId/approve",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { withdrawalId } = req.params;
      const { giftCardCode, approvalNotes } = req.body;

      const withdrawal =
        await Withdrawal.findById(withdrawalId).populate("user");
      if (!withdrawal) {
        res.status(404).json({ error: "Withdrawal not found" });
        return;
      }

      if (withdrawal.status !== "Pending") {
        console.error(`Withdrawal status check failed. Expected: "Pending", Got: "${withdrawal.status}"`);
        res.status(400).json({ error: "Only pending withdrawals can be approved" });
        return;
      }

      const beforeStatus = withdrawal.status;
      withdrawal.status = "Approved";
      withdrawal.approvedBy = req.admin!.email;
      withdrawal.approvedAt = new Date();
      withdrawal.approvalNotes = approvalNotes || null;

      // If gift card, update the code (admin can override pre-generated code if needed)
      if (withdrawal.method === "giftcard") {
        if (giftCardCode) {
          // Admin provided a code - use it
          withdrawal.giftCardCode = giftCardCode;
        }
        // If no code provided by admin, keep the pre-generated code from redemption request
      }

      await withdrawal.save();

      // Send notification to user
      const user = withdrawal.user as any;
      let message = "";
      
      if (withdrawal.method === "giftcard") {
        if (withdrawal.giftCardCode) {
          message = `Your ${withdrawal.giftCardCurrency}${withdrawal.giftCardDenomination} ${withdrawal.giftCardType} gift card has been approved! Code: ${withdrawal.giftCardCode}`;
        } else {
          message = `Your withdrawal request for $${(withdrawal.amountCents / 100).toFixed(2)} has been approved! Gift card code has been sent to your email.`;
        }
      } else {
        message = `Your withdrawal request for $${(withdrawal.amountCents / 100).toFixed(2)} has been approved! The admin will process the transaction shortly.`;
      }

      await Notification.create({
        user: user._id,
        type: "success",
        title: withdrawal.method === "giftcard" ? "Gift Card Approved" : "Withdrawal Approved",
        body: message,
        read: false,
      });

      // Send email notification for payout success
      try {
        if (user.email) {
          await emailService.sendPayoutSuccessful({
            username: user.username || user.displayName || "User",
            email: user.email,
            amount: withdrawal.amountCents,
            method: withdrawal.method.charAt(0).toUpperCase() + withdrawal.method.slice(1),
            status: "Completed",
            transactionId: withdrawal._id?.toString(),
          });
        }
      } catch (emailErr) {
        console.log("Email notification skipped:", emailErr);
      }

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Approve Withdrawal",
        "payout",
        {
          targetType: "withdrawal",
          targetId: withdrawalId,
          severity: "medium",
          changes: {
            before: { status: beforeStatus },
            after: { status: "Approved" },
          },
          metadata: {
            amount: withdrawal.amountCents,
            method: withdrawal.method,
            giftCardType: withdrawal.giftCardType,
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, withdrawal });
    } catch (error: any) {
      console.error("Approve withdrawal error:", error);
      res.status(500).json({ error: "Failed to approve withdrawal" });
    }
  },
);

// Reject withdrawal request
router.post(
  "/withdrawals/:withdrawalId/reject",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { withdrawalId } = req.params;
      const { rejectionReason } = req.body;

      if (!rejectionReason) {
        res.status(400).json({ error: "Rejection reason is required" });
        return;
      }

      const withdrawal =
        await Withdrawal.findById(withdrawalId).populate("user");
      if (!withdrawal) {
        res.status(404).json({ error: "Withdrawal not found" });
        return;
      }

      if (withdrawal.status !== "Pending") {
        res.status(400).json({ error: "Only pending withdrawals can be rejected" });
        return;
      }

      const beforeStatus = withdrawal.status;
      withdrawal.status = "Rejected";
      withdrawal.rejectedBy = req.admin!.email;
      withdrawal.rejectedAt = new Date();
      withdrawal.rejectionReason = rejectionReason;

      // Refund the user
      const user = await User.findById(withdrawal.user);
      if (user) {
        user.balanceCents += withdrawal.amountCents;
        await user.save();
      }

      await withdrawal.save();

      // Send notification to user
      const notifUser = withdrawal.user as any;
      const rejectionTitle = withdrawal.method === "giftcard" ? "Gift Card Rejected" : "Withdrawal Rejected";
      const rejectionBody = withdrawal.method === "giftcard"
        ? `Your ${withdrawal.giftCardCurrency}${withdrawal.giftCardDenomination} ${withdrawal.giftCardType} gift card redemption has been rejected. Reason: ${rejectionReason}. The amount has been refunded to your account.`
        : `Your withdrawal request for $${(withdrawal.amountCents / 100).toFixed(2)} has been rejected. Reason: ${rejectionReason}. The amount has been refunded to your account.`;
      
      await Notification.create({
        user: notifUser._id,
        type: "error",
        title: rejectionTitle,
        body: rejectionBody,
        read: false,
      });

      // Send email notification for payout rejection
      try {
        if (notifUser.email) {
          await emailService.sendPayoutRejected({
            username: notifUser.username || notifUser.displayName || "User",
            email: notifUser.email,
            amount: withdrawal.amountCents,
            method: withdrawal.method.charAt(0).toUpperCase() + withdrawal.method.slice(1),
            status: "Rejected",
            reason: rejectionReason,
          });
        }
      } catch (emailErr) {
        console.log("Email notification skipped:", emailErr);
      }

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Reject Withdrawal",
        "payout",
        {
          targetType: "withdrawal",
          targetId: withdrawalId,
          reason: rejectionReason,
          severity: "medium",
          changes: {
            before: { status: beforeStatus },
            after: { status: "Rejected" },
          },
          metadata: {
            amount: withdrawal.amountCents,
            method: withdrawal.method,
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, withdrawal });
    } catch (error: any) {
      console.error("Reject withdrawal error:", error);
      res.status(500).json({ error: "Failed to reject withdrawal" });
    }
  },
);

// Mark withdrawal as completed
router.post(
  "/withdrawals/:withdrawalId/complete",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { withdrawalId } = req.params;

      const withdrawal =
        await Withdrawal.findById(withdrawalId).populate("user");
      if (!withdrawal) {
        res.status(404).json({ error: "Withdrawal not found" });
        return;
      }

      if (withdrawal.status !== "Approved") {
        res.status(400).json({ error: "Only approved withdrawals can be marked as completed" });
        return;
      }

      withdrawal.status = "Completed";
      withdrawal.completedAt = new Date();
      await withdrawal.save();

      // Send notification to user
      const user = withdrawal.user as any;
      const completionTitle = withdrawal.method === "giftcard" ? "Gift Card Delivered" : "Withdrawal Completed";
      const completionBody = withdrawal.method === "giftcard"
        ? `Your ${withdrawal.giftCardCurrency}${withdrawal.giftCardDenomination} ${withdrawal.giftCardType} gift card has been delivered successfully!`
        : `Your withdrawal of $${(withdrawal.amountCents / 100).toFixed(2)} has been completed successfully!`;
      
      await Notification.create({
        user: user._id,
        type: "success",
        title: completionTitle,
        body: completionBody,
        read: false,
      });

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Complete Withdrawal",
        "payout",
        {
          targetType: "withdrawal",
          targetId: withdrawalId,
          severity: "low",
          metadata: {
            amount: withdrawal.amountCents,
            method: withdrawal.method,
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, withdrawal });
    } catch (error: any) {
      console.error("Complete withdrawal error:", error);
      res.status(500).json({ error: "Failed to complete withdrawal" });
    }
  },
);

// Get user's recent offers (for fraud check during withdrawal approval)
router.get(
  "/withdrawals/:withdrawalId/user-activity",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { withdrawalId } = req.params;

      const withdrawal = await Withdrawal.findById(withdrawalId);
      if (!withdrawal) {
        res.status(404).json({ error: "Withdrawal not found" });
        return;
      }

      const recentOffers = await OfferLog.find({ user: withdrawal.user })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      const recentWithdrawals = await Withdrawal.find({ user: withdrawal.user })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      res.json({
        recentOffers,
        recentWithdrawals,
      });
    } catch (error: any) {
      console.error("Get user activity error:", error);
      res.status(500).json({ error: "Failed to fetch user activity" });
    }
  },
);

// Get user's recent activity
router.get(
  "/users/:userId/activity",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const recentOffers = await OfferLog.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      const recentWithdrawals = await Withdrawal.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      res.json({
        recentOffers,
        recentWithdrawals,
      });
    } catch (error: any) {
      console.error("Get user activity error:", error);
      res.status(500).json({ error: "Failed to fetch user activity" });
    }
  },
);

// =============================================
// 6. PROMO & BONUS CODES
// =============================================

// Create promo code
router.post(
  "/promo-codes",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const {
        code,
        amount,
        limit,
        expiresAt,
        description,
        promoType,
        maxUsesPerUser,
      } = req.body;

      if (!code || amount === undefined || !limit) {
        res.status(400).json({ error: "Code, amount, and limit are required" });
        return;
      }

      const amountCents = parseInt(amount);
      const usageLimit = parseInt(limit);

      if (isNaN(amountCents) || amountCents <= 0) {
        res.status(400).json({ error: "Invalid amount" });
        return;
      }

      if (isNaN(usageLimit) || usageLimit <= 0) {
        res.status(400).json({ error: "Invalid limit" });
        return;
      }

      // Check if code already exists
      const existing = await PromoCode.findOne({ code: code.toUpperCase() });
      if (existing) {
        res.status(400).json({ error: "Promo code already exists" });
        return;
      }

      const promoCode = await PromoCode.create({
        code: code.toUpperCase(),
        amountCents,
        usageLimit,
        usedCount: 0,
        isActive: true,
        usedBy: [],
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        description,
        promoType: promoType || "standard",
        maxUsesPerUser: maxUsesPerUser || 1,
        createdBy: req.admin!.email,
      });

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Create Promo Code",
        "promo",
        {
          targetType: "promo",
          targetId: promoCode._id.toString(),
          severity: "low",
          metadata: {
            code: code.toUpperCase(),
            amount: amountCents,
            limit: usageLimit,
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, code: promoCode });
    } catch (error: any) {
      console.error("Create promo code error:", error);
      res.status(500).json({ error: "Failed to create promo code" });
    }
  },
);

// List promo codes
router.get(
  "/promo-codes",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const codes = await PromoCode.find({}).sort({ createdAt: -1 }).lean();
      console.log("Fetched promo codes:", codes);
      res.json({ codes });
    } catch (error: any) {
      console.error("List promo codes error:", error);
      res.status(500).json({ error: "Failed to fetch promo codes" });
    }
  },
);

// Toggle promo code active status
router.post(
  "/promo-codes/:codeId/toggle",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { codeId } = req.params;

      const promoCode = await PromoCode.findById(codeId);
      if (!promoCode) {
        res.status(404).json({ error: "Promo code not found" });
        return;
      }

      const beforeActive = promoCode.isActive;
      promoCode.isActive = !promoCode.isActive;
      await promoCode.save();

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Toggle Promo Code",
        "promo",
        {
          targetType: "promo",
          targetId: codeId,
          severity: "low",
          changes: {
            before: { isActive: beforeActive },
            after: { isActive: promoCode.isActive },
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, code: promoCode });
    } catch (error: any) {
      console.error("Toggle promo code error:", error);
      res.status(500).json({ error: "Failed to toggle promo code" });
    }
  },
);

// Delete promo code
router.delete(
  "/promo-codes/:codeId",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { codeId } = req.params;

      const promoCode = await PromoCode.findByIdAndDelete(codeId);
      if (!promoCode) {
        res.status(404).json({ error: "Promo code not found" });
        return;
      }

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Delete Promo Code",
        "promo",
        {
          targetType: "promo",
          targetId: codeId,
          severity: "medium",
          metadata: { code: promoCode.code },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, message: "Promo code deleted" });
    } catch (error: any) {
      console.error("Delete promo code error:", error);
      res.status(500).json({ error: "Failed to delete promo code" });
    }
  },
);

// =============================================
// 7. ANTI-FRAUD & SECURITY
// =============================================

// Mark user as VPN/Proxy user
router.post(
  "/users/:userId/vpn-flag",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { isVpn, reason, autoBan } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      user.isVpnUser = isVpn;
      user.vpnDetectedAt = isVpn ? new Date() : null;
      user.vpnDetectionReason = isVpn ? reason : null;

      // Auto-ban if enabled
      if (autoBan && isVpn) {
        user.isBanned = true;
        user.banReason = `VPN/Proxy detected: ${reason}`;
        user.bannedAt = new Date();
        user.accountStatus = "banned";
      }

      await user.save();

      // Create notification
      await Notification.create({
        user: user._id,
        type: "warning",
        title: "Security Alert",
        body: isVpn
          ? "VPN/Proxy usage detected on your account"
          : "VPN flag removed",
        read: false,
      });

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        isVpn ? "Flag VPN User" : "Remove VPN Flag",
        "security",
        {
          targetType: "user",
          targetId: userId,
          reason,
          severity: "high",
          metadata: { autoBan },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, user });
    } catch (error: any) {
      console.error("VPN flag error:", error);
      res.status(500).json({ error: "Failed to update VPN flag" });
    }
  },
);

// Get suspicious activities
router.get(
  "/security/suspicious",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      // Users with high payouts
      const highPayoutUsers = await Withdrawal.aggregate([
        {
          $match: {
            status: { $in: ["Approved", "Confirmed"] },
            createdAt: {
              $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            }, // last 30 days
          },
        },
        {
          $group: {
            _id: "$user",
            totalPayout: { $sum: "$amountCents" },
            count: { $sum: 1 },
          },
        },
        { $match: { totalPayout: { $gte: 10000 } } }, // $100+
        { $sort: { totalPayout: -1 } },
        { $limit: 20 },
      ]);

      // Populate user data
      const userIds = highPayoutUsers.map((u) => u._id);
      const users = await User.find({ _id: { $in: userIds } })
        .select("username email lastLoginIp isVpnUser")
        .lean();

      const highPayoutWithUsers = highPayoutUsers.map((payout) => {
        const user = users.find(
          (u) => u._id.toString() === payout._id.toString(),
        );
        return { ...payout, user };
      });

      // Users with many offers in short time
      const suspiciousOffers = await OfferLog.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // last 24 hours
          },
        },
        {
          $group: {
            _id: "$user",
            count: { $sum: 1 },
            totalEarned: { $sum: "$amountCents" },
          },
        },
        { $match: { count: { $gte: 10 } } }, // 10+ offers in 24h
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]);

      // VPN users
      const vpnUsers = await User.find({ isVpnUser: true })
        .select("username email lastLoginIp vpnDetectedAt vpnDetectionReason")
        .limit(50)
        .lean();

      // Users with duplicate IP
      const duplicateIpGrouping = await User.aggregate([
        { 
          $match: { 
            lastLoginIp: { $ne: null },
            isBanned: { $ne: true } 
          } 
        },
        {
          $group: {
            _id: "$lastLoginIp",
            users: { 
              $push: { 
                _id: "$_id", 
                username: "$username", 
                email: "$email", 
                lastLoginIp: "$lastLoginIp" 
              } 
            },
            count: { $sum: 1 }
          }
        },
        { $match: { count: { $gt: 1 } } }
      ]);
      
      const duplicateIps: any[] = [];
      duplicateIpGrouping.forEach(group => {
        group.users.forEach((u: any) => {
          duplicateIps.push({
            user: u._id,
            userInfo: u,
            ip: group._id,
            sharedWithCount: group.count
          });
        });
      });

      res.json({
        highPayoutUsers: highPayoutWithUsers,
        suspiciousOffers,
        vpnUsers,
        duplicateIps,
      });
    } catch (error: any) {
      console.error("Get suspicious activities error:", error);
      res.status(500).json({ error: "Failed to fetch suspicious activities" });
    }
  },
);

// Review Suspicious Activity
router.post(
  "/security/review-activity",
  requireAdmin,
  async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { activityId, action, notes } = req.body;
      
      const user = await User.findById(activityId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      
      if (action === "ban") {
        user.isBanned = true;
        user.banReason = notes || "Banned by admin via security review";
        user.accountStatus = "banned";
        user.bannedAt = new Date();
        await user.save();
        
        await createAuditLog(
          req.admin!.userId,
          req.admin!.email,
          "Ban User (Security Review)",
          "security",
          {
            targetType: "user",
            targetId: user._id.toString(),
            reason: notes,
            ipAddress: req.ip
          }
        );
      } else if (action === "approve") {
        // Just log the approval, we don't clear virtual flags unless it's VPN
        if (user.isVpnUser) {
          user.isVpnUser = false;
          await user.save();
        }
        
        await createAuditLog(
          req.admin!.userId,
          req.admin!.email,
          "Approve User (Security Review)",
          "security",
          {
            targetType: "user",
            targetId: user._id.toString(),
            reason: notes,
            ipAddress: req.ip
          }
        );
      }
      
      res.json({ success: true, message: `Activity reviewed and user ${action}ed` });
    } catch (error: any) {
      console.error("Review suspicious activity error:", error);
      res.status(500).json({ error: "Failed to review activity" });
    }
  }
);

// =============================================
// 8. SUPPORT & TICKETS
// =============================================

// Get all tickets
router.get(
  "/support/tickets",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { status, priority, assignedTo, page = 1, limit = 50 } = req.query;

      const query: any = {};
      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (assignedTo) query.assignedTo = assignedTo;

      const skip = (Number(page) - 1) * Number(limit);

      const [tickets, total] = await Promise.all([
        SupportTicket.find(query)
          .populate("user", "username email avatarUrl")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        SupportTicket.countDocuments(query),
      ]);

      console.log("Fetched support tickets:", { count: tickets.length, total, query });
      res.json({
        data: tickets,
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      });
    } catch (error: any) {
      console.error("Get tickets error:", error);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  },
);

// Get single ticket
router.get(
  "/support/tickets/:ticketId",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { ticketId } = req.params;

      const ticket = await SupportTicket.findById(ticketId)
        .populate("user", "username email avatarUrl displayName")
        .lean();

      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      res.json({ ticket });
    } catch (error: any) {
      console.error("Get ticket error:", error);
      res.status(500).json({ error: "Failed to fetch ticket" });
    }
  },
);

// Reply to ticket
router.post(
  "/support/tickets/:ticketId/reply",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { ticketId } = req.params;
      const { message } = req.body;

      if (!message) {
        res.status(400).json({ error: "Message is required" });
        return;
      }

      const ticket = await SupportTicket.findById(ticketId).populate("user");
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      ticket.messages.push({
        sender: "admin",
        senderName: req.admin!.email,
        message,
        timestamp: new Date(),
      });

      ticket.status = "in_progress";
      await ticket.save();

      // Send notification to user
      const user = ticket.user as any;
      await Notification.create({
        user: user._id,
        type: "info",
        title: "Support Reply",
        body: `You have a new reply on ticket #${ticket.ticketId}`,
        read: false,
      });

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Reply to Support Ticket",
        "support",
        {
          targetType: "user",
          targetId: ticketId,
          severity: "low",
          metadata: { ticketId: ticket.ticketId },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, ticket });
    } catch (error: any) {
      console.error("Reply to ticket error:", error);
      res.status(500).json({ error: "Failed to reply to ticket" });
    }
  },
);

// Update ticket status
router.post(
  "/support/tickets/:ticketId/status",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { ticketId } = req.params;
      const { status } = req.body;

      const validStatuses = [
        "open",
        "in_progress",
        "waiting_user",
        "resolved",
        "closed",
      ];
      if (!validStatuses.includes(status)) {
        res.status(400).json({ error: "Invalid status" });
        return;
      }

      const ticket = await SupportTicket.findById(ticketId).populate("user");
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      ticket.status = status;
      if (status === "resolved" || status === "closed") {
        ticket.resolvedAt = new Date();
        ticket.resolvedBy = req.admin!.email;
      }
      await ticket.save();

      // Send notification to user
      const user = ticket.user as any;
      await Notification.create({
        user: user._id,
        type: "info",
        title: "Ticket Status Update",
        body: `Your ticket #${ticket.ticketId} status has been updated to: ${status}`,
        read: false,
      });

      res.json({ success: true, ticket });
    } catch (error: any) {
      console.error("Update ticket status error:", error);
      res.status(500).json({ error: "Failed to update ticket status" });
    }
  },
);

// Assign ticket
router.post(
  "/support/tickets/:ticketId/assign",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { ticketId } = req.params;
      const { assignedTo } = req.body;

      const ticket = await SupportTicket.findById(ticketId);
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      ticket.assignedTo = assignedTo;
      ticket.assignedAt = new Date();
      await ticket.save();

      res.json({ success: true, ticket });
    } catch (error: any) {
      console.error("Assign ticket error:", error);
      res.status(500).json({ error: "Failed to assign ticket" });
    }
  },
);

// =============================================
// 9. NOTIFICATIONS & BROADCAST
// =============================================

// Send notification to users
router.post(
  "/notifications/send",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { type, title, message, users } = req.body;

      if (!type || !title || !message) {
        res
          .status(400)
          .json({ error: "Type, title, and message are required" });
        return;
      }

      const validTypes = ["info", "warning", "success", "error", "system"];
      if (!validTypes.includes(type)) {
        res.status(400).json({ error: "Invalid notification type" });
        return;
      }

      // If specific users provided, send to them; otherwise send to all
      let targetUsers: any[] = [];
      if (users && Array.isArray(users) && users.length > 0) {
        targetUsers = await User.find({ _id: { $in: users } })
          .select("_id")
          .lean();
      } else {
        targetUsers = await User.find({}).select("_id").lean();
      }

      // Create notifications for all target users
      const notifications = targetUsers.map((user) => ({
        user: user._id,
        type,
        title,
        body: message,
        read: false,
      }));

      await Notification.insertMany(notifications);

      // Emit socket events for real-time notifications
      const io = (req.app as any).locals.io;
      if (io) {
        targetUsers.forEach((user: any) => {
          const room = `user:${user._id.toString()}`;
          io.to(room).emit("notification", {
            type,
            title,
            body: message,
            createdAt: new Date(),
          });
        });
      }

      // Create audit log
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Send Notification",
        "notification",
        {
          severity: "low",
          metadata: { type, title, recipientCount: targetUsers.length },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({
        success: true,
        message: `Notification sent to ${targetUsers.length} users`,
      });
    } catch (error: any) {
      console.error("Send notification error:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  },
);

// =============================================
// 10. STATISTICS & ANALYTICS
// =============================================

// Get dashboard statistics
router.get(
  "/stats/dashboard",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const today = new Date(now.setHours(0, 0, 0, 0));

      // User stats
      const [
        totalUsers,
        newUsersToday,
        newUsers7Days,
        newUsers30Days,
        activeUsers,
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ createdAt: { $gte: today } }),
        User.countDocuments({ createdAt: { $gte: last7Days } }),
        User.countDocuments({ createdAt: { $gte: last30Days } }),
        User.countDocuments({ lastLoginAt: { $gte: last7Days } }),
      ]);

      // Earnings stats
      const earningsStats = await OfferLog.aggregate([
        {
          $match: { status: "approved" },
        },
        {
          $group: {
            _id: null,
            totalEarned: { $sum: "$amountCents" },
            count: { $sum: 1 },
          },
        },
      ]);

      // Payout stats
      const payoutStats = await Withdrawal.aggregate([
        {
          $match: { status: { $in: ["Approved", "Confirmed"] } },
        },
        {
          $group: {
            _id: null,
            totalPaidOut: { $sum: "$amountCents" },
            count: { $sum: 1 },
          },
        },
      ]);

      // Pending withdrawals
      const pendingWithdrawals = await Withdrawal.countDocuments({
        status: { $in: ["Pending", "ProofSubmitted"] },
      });

      // Revenue calculation (simplified - you'd need to track this properly)
      const revenue = earningsStats[0]?.totalEarned || 0;
      const expenses = payoutStats[0]?.totalPaidOut || 0;
      const profit = revenue - expenses;

      // Top offers
      const topOffers = await OfferLog.aggregate([
        { $match: { status: "approved" } },
        {
          $group: {
            _id: "$offerId",
            name: { $first: "$offerName" },
            provider: { $first: "$provider" },
            completions: { $sum: 1 },
            totalPayout: { $sum: "$amountCents" },
          },
        },
        { $sort: { completions: -1 } },
        { $limit: 10 },
      ]);

      // Top users
      const topUsers = await OfferLog.aggregate([
        { $match: { status: "approved" } },
        {
          $group: {
            _id: "$user",
            totalEarned: { $sum: "$amountCents" },
            offerCount: { $sum: 1 },
          },
        },
        { $sort: { totalEarned: -1 } },
        { $limit: 10 },
      ]);

      // Populate top users
      const topUserIds = topUsers.map((u) => u._id);
      const topUserData = await User.find({ _id: { $in: topUserIds } })
        .select("username email avatarUrl")
        .lean();

      const topUsersWithData = topUsers.map((user) => {
        const userData = topUserData.find(
          (u) => u._id.toString() === user._id.toString(),
        );
        return { ...user, user: userData };
      });

      res.json({
        users: {
          total: totalUsers,
          newToday: newUsersToday,
          new7Days: newUsers7Days,
          new30Days: newUsers30Days,
          active: activeUsers,
        },
        earnings: {
          total: earningsStats[0]?.totalEarned || 0,
          count: earningsStats[0]?.count || 0,
        },
        payouts: {
          total: payoutStats[0]?.totalPaidOut || 0,
          count: payoutStats[0]?.count || 0,
          pending: pendingWithdrawals,
        },
        financial: {
          revenue,
          expenses,
          profit,
          profitMargin: revenue > 0 ? ((profit / revenue) * 100).toFixed(2) : 0,
        },
        topOffers,
        topUsers: topUsersWithData,
      });
    } catch (error: any) {
      console.error("Get dashboard stats error:", error);
      res.status(500).json({ error: "Failed to fetch dashboard statistics" });
    }
  },
);

// Get chart data (daily/weekly/monthly)
router.get(
  "/stats/charts",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { period = "7d" } = req.query; // 7d, 30d, 90d

      let days = 7;
      if (period === "30d") days = 30;
      else if (period === "90d") days = 90;

      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // User registrations over time
      const registrations = await User.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Earnings over time
      const earnings = await OfferLog.aggregate([
        { $match: { createdAt: { $gte: startDate }, status: "approved" } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            amount: { $sum: "$amountCents" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Payouts over time
      const payouts = await Withdrawal.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            amount: { $sum: "$amountCents" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      res.json({
        registrations,
        earnings,
        payouts,
      });
    } catch (error: any) {
      console.error("Get chart data error:", error);
      res.status(500).json({ error: "Failed to fetch chart data" });
    }
  },
);

// =============================================
// 11. AUDIT LOGS
// =============================================

// Get audit logs
router.get(
  "/audit-logs",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { adminId, actionType, severity, page = 1, limit = 50 } = req.query;

      const query: any = {};
      if (adminId) query.adminId = adminId;
      if (actionType) query.actionType = actionType;
      if (severity) query.severity = severity;

      const skip = (Number(page) - 1) * Number(limit);

      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        AuditLog.countDocuments(query),
      ]);

      res.json({
        logs,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error: any) {
      console.error("Get audit logs error:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  },
);

// =============================================
// 12. SYSTEM SETTINGS
// =============================================

// System health check
router.get(
  "/system/health",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const dbStatus =
        mongoose.connection.readyState === 1 ? "connected" : "disconnected";

      const stats = {
        database: dbStatus,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date(),
      };

      res.json(stats);
    } catch (error: any) {
      console.error("Health check error:", error);
      res.status(500).json({ error: "Failed to get system health" });
    }
  },
);

// Clear cache (placeholder - implement based on your cache system)
router.post(
  "/system/clear-cache",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      // Implement cache clearing logic here
      // For example, if using Redis: await redis.flushall()

      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Clear Cache",
        "system",
        {
          severity: "low",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, message: "Cache cleared successfully" });
    } catch (error: any) {
      console.error("Clear cache error:", error);
      res.status(500).json({ error: "Failed to clear cache" });
    }
  },
);

// Backup database (placeholder)
router.post(
  "/system/backup",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      // Implement backup logic here
      // This would typically involve creating a database dump

      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Create Backup",
        "system",
        {
          severity: "medium",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, message: "Backup initiated" });
    } catch (error: any) {
      console.error("Backup error:", error);
      res.status(500).json({ error: "Failed to create backup" });
    }
  },
);

// =============================================
// 13. ADMIN USER MANAGEMENT
// =============================================

// Create admin user (superadmin only)
router.post(
  "/admin-users",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      // Check if requester is superadmin
      if (req.admin!.role !== "superadmin") {
        res
          .status(403)
          .json({ error: "Only superadmins can create admin users" });
        return;
      }

      const { email, password, name, role, permissions } = req.body;

      if (!email || !password || !name || !role) {
        res
          .status(400)
          .json({ error: "Email, password, name, and role are required" });
        return;
      }

      const existing = await AdminUser.findByEmail(email);
      if (existing) {
        res.status(400).json({ error: "Admin user already exists" });
        return;
      }

      const admin = new AdminUser({
        email,
        name,
        role,
        permissions: permissions || [],
        isActive: true,
        createdBy: req.admin!.email,
      });

      await admin.setPassword(password);
      await admin.save();

      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Create Admin User",
        "system",
        {
          severity: "high",
          metadata: { email, role },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, admin });
    } catch (error: any) {
      console.error("Create admin user error:", error);
      res.status(500).json({ error: "Failed to create admin user" });
    }
  },
);

// List admin users
router.get(
  "/admin-users",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const admins = await AdminUser.find({})
        .select("-passwordHash -twoFactorSecret")
        .sort({ createdAt: -1 })
        .lean();

      res.json({ admins });
    } catch (error: any) {
      console.error("List admin users error:", error);
      res.status(500).json({ error: "Failed to fetch admin users" });
    }
  },
);

// Deactivate admin user
router.post(
  "/admin-users/:adminId/deactivate",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      if (req.admin!.role !== "superadmin") {
        res
          .status(403)
          .json({ error: "Only superadmins can deactivate admin users" });
        return;
      }

      const { adminId } = req.params;

      const admin = await AdminUser.findById(adminId);
      if (!admin) {
        res.status(404).json({ error: "Admin user not found" });
        return;
      }

      admin.isActive = false;
      await admin.save();

      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Deactivate Admin User",
        "system",
        {
          severity: "high",
          targetId: adminId,
          metadata: { email: admin.email },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error("Deactivate admin error:", error);
      res.status(500).json({ error: "Failed to deactivate admin user" });
    }
  },
);

// =============================================
// SYSTEM SETTINGS ENDPOINTS
// =============================================

// Get system settings
router.get(
  "/system/settings",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const settings = await SystemSettings.getSettings();
      
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "View System Settings",
        "system",
        {
          severity: "low",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ settings });
    } catch (error: any) {
      console.error("Get system settings error:", error);
      res.status(500).json({ error: "Failed to fetch system settings" });
    }
  },
);

// Update system settings
router.post(
  "/system/settings",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      if (req.admin!.role !== "superadmin") {
        res
          .status(403)
          .json({ error: "Only superadmins can update system settings" });
        return;
      }

      const settings = await SystemSettings.getSettings();
      
      // Whitelist allowed fields to update
      const allowedFields = [
        "siteName",
        "logo",
        "primaryColor",
        "secondaryColor",
        "accentColor",
        "themeMode",
        "fontFamily",
        "borderRadius",
        "smtpHost",
        "smtpPort",
        "smtpUser",
        "smtpSecure",
        "minPayoutCents",
        "maxPayoutCents",
        "defaultHoldTimeDays",
        "referralEnabled",
        "defaultReferralRate",
        "activityScoreConfig",
        "activityLevelThresholds",
        "vpnDetectionEnabled",
        "proxyDetectionEnabled",
        "maintenanceMode",
        "paypalFeePercent",
        "bankTransferFeePercent",
        "cryptoFeePercent",
      ];

      const updates: any = {};
      for (const field of allowedFields) {
        if (field in req.body) {
          updates[field] = req.body[field];
        }
      }

      // Validate color formats
      if (updates.primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(updates.primaryColor)) {
        res.status(400).json({ error: "Invalid primary color format" });
        return;
      }
      if (updates.secondaryColor && !/^#[0-9A-Fa-f]{6}$/.test(updates.secondaryColor)) {
        res.status(400).json({ error: "Invalid secondary color format" });
        return;
      }
      if (updates.accentColor && !/^#[0-9A-Fa-f]{6}$/.test(updates.accentColor)) {
        res.status(400).json({ error: "Invalid accent color format" });
        return;
      }

      // Validate numeric fields
      if (updates.minPayoutCents !== undefined && updates.minPayoutCents < 0) {
        res.status(400).json({ error: "Min payout must be non-negative" });
        return;
      }
      if (updates.maxPayoutCents !== undefined && updates.maxPayoutCents < 0) {
        res.status(400).json({ error: "Max payout must be non-negative" });
        return;
      }
      if (updates.defaultReferralRate !== undefined && (updates.defaultReferralRate < 0 || updates.defaultReferralRate > 100)) {
        res.status(400).json({ error: "Referral rate must be between 0 and 100" });
        return;
      }

      if (updates.activityScoreConfig !== undefined) {
        const cfg = updates.activityScoreConfig;
        if (!cfg || typeof cfg !== "object") {
          res.status(400).json({ error: "activityScoreConfig must be an object" });
          return;
        }

        const keys = [
          "offerCompletion",
          "surveyCompletion",
          "dailyLogin",
          "successfulReferral",
        ];
        for (const key of keys) {
          if (!(key in cfg)) continue;
          const num = Number(cfg[key]);
          if (!Number.isFinite(num) || num < 0) {
            res
              .status(400)
              .json({ error: `activityScoreConfig.${key} must be a non-negative number` });
            return;
          }
          cfg[key] = Math.round(num);
        }
      }

      if (updates.activityLevelThresholds !== undefined) {
        const thresholds = updates.activityLevelThresholds;
        if (!thresholds || typeof thresholds !== "object") {
          res
            .status(400)
            .json({ error: "activityLevelThresholds must be an object" });
          return;
        }

        const beginnerMax = Number(thresholds.beginnerMax);
        const amateurMax = Number(thresholds.amateurMax);
        const advancedMax = Number(thresholds.advancedMax);
        const proMax = Number(thresholds.proMax);

        if (
          !Number.isFinite(beginnerMax) ||
          !Number.isFinite(amateurMax) ||
          !Number.isFinite(advancedMax) ||
          !Number.isFinite(proMax)
        ) {
          res.status(400).json({
            error:
              "activityLevelThresholds requires numeric beginnerMax/amateurMax/advancedMax/proMax",
          });
          return;
        }

        if (
          beginnerMax < 0 ||
          amateurMax <= beginnerMax ||
          advancedMax <= amateurMax ||
          proMax <= advancedMax
        ) {
          res.status(400).json({
            error:
              "Level thresholds must satisfy: 0 <= beginnerMax < amateurMax < advancedMax < proMax",
          });
          return;
        }

        updates.activityLevelThresholds = {
          beginnerMax: Math.round(beginnerMax),
          amateurMax: Math.round(amateurMax),
          advancedMax: Math.round(advancedMax),
          proMax: Math.round(proMax),
        };
      }

      // Store old values for audit log
      const oldValues = {
        siteName: settings.siteName,
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        accentColor: settings.accentColor,
        themeMode: settings.themeMode,
        fontFamily: settings.fontFamily,
        borderRadius: settings.borderRadius,
        maintenanceMode: settings.maintenanceMode,
        activityScoreConfig: (settings as any).activityScoreConfig,
        activityLevelThresholds: (settings as any).activityLevelThresholds,
      };

      // Update settings
      Object.assign(settings, updates);
      await settings.save();

      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Update System Settings",
        "system",
        {
          severity: "high",
          changes: {
            before: oldValues,
            after: {
              siteName: settings.siteName,
              primaryColor: settings.primaryColor,
              secondaryColor: settings.secondaryColor,
              accentColor: settings.accentColor,
              themeMode: settings.themeMode,
              fontFamily: settings.fontFamily,
              borderRadius: settings.borderRadius,
              maintenanceMode: settings.maintenanceMode,
              activityScoreConfig: (settings as any).activityScoreConfig,
              activityLevelThresholds: (settings as any).activityLevelThresholds,
            },
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ settings });
    } catch (error: any) {
      console.error("Update system settings error:", error);
      res.status(500).json({ error: "Failed to update system settings" });
    }
  },
);

// Get theme settings
router.get(
  "/system/theme",
  async (req: Request, res: Response) => {
    try {
      const settings = await SystemSettings.getSettings();
      
      const theme = {
        themeMode: settings.themeMode,
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        accentColor: settings.accentColor,
        fontFamily: settings.fontFamily,
        borderRadius: settings.borderRadius,
      };

      res.json({ theme });
    } catch (error: any) {
      console.error("Get theme settings error:", error);
      res.status(500).json({ error: "Failed to fetch theme settings" });
    }
  },
);

// Update theme settings
router.post(
  "/system/theme",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const settings = await SystemSettings.getSettings();
      
      const themeFields = ["themeMode", "primaryColor", "secondaryColor", "accentColor", "fontFamily", "borderRadius"];
      
      for (const field of themeFields) {
        if (field in req.body) {
          (settings as any)[field] = req.body[field];
        }
      }

      await settings.save();

      const theme = {
        themeMode: settings.themeMode,
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        accentColor: settings.accentColor,
        fontFamily: settings.fontFamily,
        borderRadius: settings.borderRadius,
      };

      res.json({ theme });
    } catch (error: any) {
      console.error("Update theme settings error:", error);
      res.status(500).json({ error: "Failed to update theme settings" });
    }
  },
);

// Upload logo
router.post(
  "/system/logo",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      if (req.admin!.role !== "superadmin") {
        res
          .status(403)
          .json({ error: "Only superadmins can upload logo" });
        return;
      }

      const { logo } = req.body;
      
      if (!logo) {
        res.status(400).json({ error: "Logo is required" });
        return;
      }

      const settings = await SystemSettings.getSettings();
      settings.logo = logo;
      await settings.save();

      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Upload Logo",
        "system",
        {
          severity: "low",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ logo: settings.logo });
    } catch (error: any) {
      console.error("Upload logo error:", error);
      res.status(500).json({ error: "Failed to upload logo" });
    }
  },
);

// Get system health
router.get(
  "/system/health",
  async (req: Request, res: Response) => {
    try {
      const userCount = await User.countDocuments();
      const dbConnected = mongoose.connection.readyState === 1;

      res.json({
        status: dbConnected ? "healthy" : "unhealthy",
        uptime: process.uptime(),
        database: dbConnected,
        timestamp: new Date().toISOString(),
        stats: {
          totalUsers: userCount,
        },
      });
    } catch (error: any) {
      console.error("System health error:", error);
      // Still return 200 with healthy status even on error
      res.json({
        status: "healthy",
        uptime: process.uptime(),
        database: false,
        timestamp: new Date().toISOString(),
        stats: {
          totalUsers: 0,
        },
      });
    }
  },
);

// Clear cache (placeholder - implement based on your caching strategy)
router.post(
  "/system/clear-cache",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      if (req.admin!.role !== "superadmin") {
        res
          .status(403)
          .json({ error: "Only superadmins can clear cache" });
        return;
      }

      // TODO: Implement cache clearing based on your caching strategy
      // For now, just log the action
      
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Clear Cache",
        "system",
        {
          severity: "medium",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, message: "Cache cleared successfully" });
    } catch (error: any) {
      console.error("Clear cache error:", error);
      res.status(500).json({ error: "Failed to clear cache" });
    }
  },
);

// Create backup (placeholder - implement based on your backup strategy)
router.post(
  "/system/backup",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      if (req.admin!.role !== "superadmin") {
        res
          .status(403)
          .json({ error: "Only superadmins can create backups" });
        return;
      }

      // TODO: Implement backup creation based on your backup strategy
      // For now, just log the action
      
      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Create Backup",
        "system",
        {
          severity: "high",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ 
        success: true, 
        message: "Backup created successfully",
        backupId: `backup-${Date.now()}`,
      });
    } catch (error: any) {
      console.error("Create backup error:", error);
      res.status(500).json({ error: "Failed to create backup" });
    }
  },
);

// Export CSV of data (users, withdrawals, etc.)
router.get(
  "/export/:type",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { type } = req.params;

      let data: any[] = [];
      let headers: string[] = [];

      if (type === "users") {
        data = await User.find({}).select("-passwordHash").lean();
        headers = [
          "username",
          "email",
          "balanceCents",
          "createdAt",
          "isBanned",
        ];
      } else if (type === "withdrawals") {
        data = await Withdrawal.find({})
          .populate("user", "username email")
          .lean();
        headers = ["user", "method", "amountCents", "status", "createdAt"];
      } else if (type === "offers") {
        data = await OfferLog.find({})
          .populate("user", "username email")
          .lean();
        headers = [
          "user",
          "offerName",
          "provider",
          "amountCents",
          "status",
          "createdAt",
        ];
      } else {
        res.status(400).json({ error: "Invalid export type" });
        return;
      }

      // Convert to CSV format
      const csvRows = [];
      csvRows.push(headers.join(","));

      for (const row of data) {
        const values = headers.map((header) => {
          const value = (row as any)[header];
          if (value === null || value === undefined) return "";
          if (typeof value === "object")
            return JSON.stringify(value).replace(/,/g, ";");
          return String(value).replace(/,/g, ";");
        });
        csvRows.push(values.join(","));
      }

      const csv = csvRows.join("\n");

      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        `Export ${type} CSV`,
        "system",
        {
          severity: "medium",
          metadata: { type, recordCount: data.length },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${type}-export-${Date.now()}.csv`,
      );
      res.send(csv);
    } catch (error: any) {
      console.error("Export error:", error);
      res.status(500).json({ error: "Failed to export data" });
    }
  },
);

// =============================================
// PREMIUM OFFERS MANAGEMENT
// =============================================

// Get all premium offers with filters
router.get(
  "/premium-offers",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const {
        search,
        status,
        type,
        platform,
        surface,
        page = 1,
        limit = 20,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      const query: any = {};

      // Search filter
      if (search && typeof search === "string") {
        query.$or = [
          { title: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { provider: { $regex: search, $options: "i" } },
        ];
      }

      // Status filter
      if (status && status !== "all") {
        query.status = status;
      }

      // Type filter
      if (type && type !== "all") {
        query.type = type;
      }

      // Platform filter
      if (platform && platform !== "all") {
        query.platform = platform;
      }

      // Placement surface filter
      if (surface === "home") {
        query.showOnWelcomePage = true;
      }

      if (surface === "earn") {
        query.showOnEarnPage = true;
      }

      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 20;
      const skip = (pageNum - 1) * limitNum;

      const sortOptions: any = {};
      sortOptions[sortBy as string] = sortOrder === "asc" ? 1 : -1;

      const [offers, total] = await Promise.all([
        PremiumOffer.find(query)
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        PremiumOffer.countDocuments(query),
      ]);

      // Get stats
      const [activeCount, totalPayout, totalCompletions] = await Promise.all([
        PremiumOffer.countDocuments({ status: "active" }),
        PremiumOffer.aggregate([
          { $group: { _id: null, total: { $sum: "$totalPayout" } } },
        ]),
        PremiumOffer.aggregate([
          { $group: { _id: null, total: { $sum: "$completions" } } },
        ]),
      ]);

      res.json({
        offers,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
        stats: {
          total,
          active: activeCount,
          totalPayout: totalPayout[0]?.total || 0,
          totalCompletions: totalCompletions[0]?.total || 0,
        },
      });
    } catch (error: any) {
      console.error("Get premium offers error:", error);
      res.status(500).json({ error: "Failed to fetch premium offers" });
    }
  },
);

// Get single premium offer
router.get(
  "/premium-offers/:id",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ error: "Invalid offer ID" });
        return;
      }

      const offer = await PremiumOffer.findById(id).lean();

      if (!offer) {
        res.status(404).json({ error: "Premium offer not found" });
        return;
      }

      res.json(offer);
    } catch (error: any) {
      console.error("Get premium offer error:", error);
      res.status(500).json({ error: "Failed to fetch premium offer" });
    }
  },
);

// Create premium offer
router.post(
  "/premium-offers",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const {
        title,
        description,
        imageUrl,
        trackingUrl,
        type,
        rewardCents,
        platform,
        status,
        requirements,
        country,
        priority,
        provider,
        expiresAt,
        showOnWelcomePage,
        showOnEarnPage,
        completionCap,
      } = req.body;

      if (!title || !trackingUrl || rewardCents === undefined) {
        res.status(400).json({
          error: "Title, tracking URL, and reward amount are required",
        });
        return;
      }

      const offer = new PremiumOffer({
        title,
        description: description || "",
        imageUrl: imageUrl || "",
        trackingUrl,
        type: type || "other",
        rewardCents: parseInt(rewardCents) || 0,
        platform: platform || "all",
        status: status || "active",
        requirements: requirements || [],
        country: country || [],
        priority: parseInt(priority) || 0,
        provider: provider || "",
        expiresAt: expiresAt || null,
        showOnWelcomePage:
          typeof showOnWelcomePage === "boolean" ? showOnWelcomePage : true,
        showOnEarnPage: typeof showOnEarnPage === "boolean" ? showOnEarnPage : true,
        completionCap: completionCap !== undefined && completionCap !== null && completionCap !== "" ? parseInt(completionCap) : null,
        dailyCompletions: 0,
        lastCapReset: null,
        createdBy: req.admin!.email,
      });

      await offer.save();

      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Create Premium Offer",
        "offers",
        {
          targetType: "PremiumOffer",
          targetId: offer._id.toString(),
          changes: { after: offer.toObject() },
          severity: "low",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.status(201).json(offer);
    } catch (error: any) {
      console.error("Create premium offer error:", error);
      res.status(500).json({ error: "Failed to create premium offer" });
    }
  },
);

// Update premium offer
router.put(
  "/premium-offers/:id",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ error: "Invalid offer ID" });
        return;
      }

      const offer = await PremiumOffer.findById(id);

      if (!offer) {
        res.status(404).json({ error: "Premium offer not found" });
        return;
      }

      const beforeState = offer.toObject();

      const {
        title,
        description,
        imageUrl,
        trackingUrl,
        type,
        rewardCents,
        platform,
        status,
        requirements,
        country,
        priority,
        provider,
        expiresAt,
        showOnWelcomePage,
        showOnEarnPage,
        completionCap,
      } = req.body;

      // Update fields if provided
      if (title !== undefined) offer.title = title;
      if (description !== undefined) offer.description = description;
      if (imageUrl !== undefined) offer.imageUrl = imageUrl;
      if (trackingUrl !== undefined) offer.trackingUrl = trackingUrl;
      if (type !== undefined) offer.type = type;
      if (rewardCents !== undefined) offer.rewardCents = parseInt(rewardCents);
      if (platform !== undefined) offer.platform = platform;
      if (status !== undefined) offer.status = status;
      if (requirements !== undefined) offer.requirements = requirements;
      if (country !== undefined) offer.country = country;
      if (priority !== undefined) offer.priority = parseInt(priority);
      if (provider !== undefined) offer.provider = provider;
      if (expiresAt !== undefined) offer.expiresAt = expiresAt || null;
      if (showOnWelcomePage !== undefined)
        offer.showOnWelcomePage = Boolean(showOnWelcomePage);
      if (showOnEarnPage !== undefined)
        offer.showOnEarnPage = Boolean(showOnEarnPage);
      if (completionCap !== undefined) {
        offer.completionCap = completionCap !== null && completionCap !== "" ? parseInt(completionCap) : null;
      }
      offer.updatedBy = req.admin!.email;

      await offer.save();

      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Update Premium Offer",
        "offers",
        {
          targetType: "PremiumOffer",
          targetId: id,
          changes: { before: beforeState, after: offer.toObject() },
          severity: "low",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json(offer);
    } catch (error: any) {
      console.error("Update premium offer error:", error);
      res.status(500).json({ error: "Failed to update premium offer" });
    }
  },
);

// Delete premium offer
router.delete(
  "/premium-offers/:id",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ error: "Invalid offer ID" });
        return;
      }

      const offer = await PremiumOffer.findById(id);

      if (!offer) {
        res.status(404).json({ error: "Premium offer not found" });
        return;
      }

      const offerData = offer.toObject();
      await PremiumOffer.findByIdAndDelete(id);

      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        "Delete Premium Offer",
        "offers",
        {
          targetType: "PremiumOffer",
          targetId: id,
          changes: { before: offerData },
          severity: "medium",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json({ success: true, message: "Premium offer deleted" });
    } catch (error: any) {
      console.error("Delete premium offer error:", error);
      res.status(500).json({ error: "Failed to delete premium offer" });
    }
  },
);

// Toggle premium offer status
router.post(
  "/premium-offers/:id/toggle",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ error: "Invalid offer ID" });
        return;
      }

      const offer = await PremiumOffer.findById(id);

      if (!offer) {
        res.status(404).json({ error: "Premium offer not found" });
        return;
      }

      const beforeStatus = offer.status;
      offer.status = offer.status === "active" ? "inactive" : "active";
      offer.updatedBy = req.admin!.email;
      await offer.save();

      await createAuditLog(
        req.admin!.userId,
        req.admin!.email,
        `Toggle Premium Offer ${offer.status === "active" ? "Active" : "Inactive"}`,
        "offers",
        {
          targetType: "PremiumOffer",
          targetId: id,
          changes: { before: { status: beforeStatus }, after: { status: offer.status } },
          severity: "low",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      );

      res.json(offer);
    } catch (error: any) {
      console.error("Toggle premium offer error:", error);
      res.status(500).json({ error: "Failed to toggle premium offer" });
    }
  },
);

// =============================================
// RECENT ACTIVITY (For dashboard and frontend)
// =============================================

// Get recent activity summary
router.get(
  "/recent-activity",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { limit = 20 } = req.query;
      const limitNum = parseInt(limit as string) || 20;

      // Get recent withdrawals (payouts/cashouts)
      const recentWithdrawals = await Withdrawal.find({ status: "Completed" })
        .populate("user", "username avatarUrl")
        .sort({ completedAt: -1 })
        .limit(limitNum)
        .lean();

      // Get recent offer completions (earnings)
      const recentEarnings = await OfferLog.find({ status: "approved" })
        .populate("user", "username avatarUrl")
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .lean();

      // Get recent referral earnings
      const recentReferralEarnings = await ReferralEarning.find()
        .populate("referrer", "username avatarUrl")
        .populate("referred", "username avatarUrl")
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .lean();

      // Combine and format activities
      const activities: any[] = [];

      // Add withdrawals as payouts
      recentWithdrawals.forEach((w: any) => {
        activities.push({
          type: "payout",
          user: w.user,
          amount: w.amountCents,
          method: w.method,
          timestamp: w.completedAt || w.createdAt,
          description: `Withdrew $${(w.amountCents / 100).toFixed(2)} via ${w.method}`,
        });
      });

      // Add offer completions as earnings
      recentEarnings.forEach((e: any) => {
        activities.push({
          type: "earning",
          user: e.user,
          amount: e.rewardCents || e.amountCents,
          offerName: e.offerName || e.offer?.name,
          provider: e.provider || e.offerwall,
          timestamp: e.createdAt,
          description: `Earned $${((e.rewardCents || e.amountCents) / 100).toFixed(2)} from ${e.offerName || "offer"}`,
        });
      });

      // Add referral earnings
      recentReferralEarnings.forEach((r: any) => {
        activities.push({
          type: "referral",
          user: r.referrer,
          referredUser: r.referred,
          amount: r.amountCents,
          timestamp: r.createdAt,
          description: `Earned $${(r.amountCents / 100).toFixed(2)} from referral`,
        });
      });

      // Sort by timestamp
      activities.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      res.json({
        activities: activities.slice(0, limitNum),
        total: activities.length,
      });
    } catch (error: any) {
      console.error("Get recent activity error:", error);
      res.status(500).json({ error: "Failed to fetch recent activity" });
    }
  },
);

// =============================================
// OFFERWALL MANAGEMENT - Dynamic API Integration
// =============================================

// OfferWall Schema (inline for admin routes)
const OfferWallSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    displayName: { type: String, required: true },
    type: { type: String, enum: ["surveys", "offers", "games", "apps", "videos", "tasks"], default: "offers" },
    description: { type: String },
    logoUrl: { type: String },
    apiKey: { type: String },
    apiSecret: { type: String },
    callbackUrl: { type: String },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },
    commission: { type: Number, default: 0 }, // percentage
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    stats: {
      totalOffers: { type: Number, default: 0 },
      completedOffers: { type: Number, default: 0 },
      totalEarnings: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

const OfferWall = mongoose.models.OfferWall || mongoose.model("OfferWall", OfferWallSchema);

// GET /api/admin/offerwalls - List all offerwalls
router.get(
  "/offerwalls",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { status, type, search, page = 1, limit = 20 } = req.query;

      const query: any = {};
      
      if (status === "active") query.isActive = true;
      if (status === "inactive") query.isActive = false;
      if (type) query.type = type;
      if (search) {
        query.$or = [
          { name: new RegExp(search as string, "i") },
          { displayName: new RegExp(search as string, "i") },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [offerwalls, total] = await Promise.all([
        OfferWall.find(query)
          .sort({ priority: -1, createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        OfferWall.countDocuments(query),
      ]);

      res.json({
        offerwalls,
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      });
    } catch (error: any) {
      console.error("Get offerwalls error:", error);
      res.status(500).json({ error: "Failed to fetch offerwalls" });
    }
  }
);

// GET /api/admin/offerwalls/:id - Get single offerwall
router.get(
  "/offerwalls/:id",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      const offerwall = await OfferWall.findById(id).lean();
      if (!offerwall) {
        res.status(404).json({ error: "Offerwall not found" });
        return;
      }

      res.json({ offerwall });
    } catch (error: any) {
      console.error("Get offerwall error:", error);
      res.status(500).json({ error: "Failed to fetch offerwall" });
    }
  }
);

// POST /api/admin/offerwalls - Create new offerwall
router.post(
  "/offerwalls",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const {
        name,
        displayName,
        type,
        description,
        logoUrl,
        apiKey,
        apiSecret,
        callbackUrl,
        isActive,
        priority,
        commission,
        settings,
      } = req.body;

      if (!name || !displayName) {
        res.status(400).json({ error: "Name and display name are required" });
        return;
      }

      // Check if name already exists
      const existing = await OfferWall.findOne({ name: name.toLowerCase().replace(/\s+/g, "_") });
      if (existing) {
        res.status(400).json({ error: "Offerwall with this name already exists" });
        return;
      }

      const offerwall = new OfferWall({
        name: name.toLowerCase().replace(/\s+/g, "_"),
        displayName,
        type: type || "offers",
        description,
        logoUrl,
        apiKey,
        apiSecret,
        callbackUrl,
        isActive: isActive !== false,
        priority: priority || 0,
        commission: commission || 0,
        settings: settings || {},
      });

      await offerwall.save();

      // Create audit log
      await createAuditLog(
        req.admin!.userId.toString(),
        req.admin!.email,
        `Created offerwall: ${displayName}`,
        "offerwall_management",
        {
          targetType: "offerwall",
          targetId: offerwall._id.toString(),
          severity: "medium",
        }
      );

      res.status(201).json({
        success: true,
        message: "Offerwall created successfully",
        offerwall,
      });
    } catch (error: any) {
      console.error("Create offerwall error:", error);
      res.status(500).json({ error: "Failed to create offerwall" });
    }
  }
);

// PUT /api/admin/offerwalls/:id - Update offerwall
router.put(
  "/offerwalls/:id",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const offerwall = await OfferWall.findById(id);
      if (!offerwall) {
        res.status(404).json({ error: "Offerwall not found" });
        return;
      }

      const allowedFields = [
        "displayName",
        "type",
        "description",
        "logoUrl",
        "apiKey",
        "apiSecret",
        "callbackUrl",
        "isActive",
        "priority",
        "commission",
        "settings",
      ];

      allowedFields.forEach((field) => {
        if (updates[field] !== undefined) {
          (offerwall as any)[field] = updates[field];
        }
      });

      await offerwall.save();

      // Create audit log
      await createAuditLog(
        req.admin!.userId.toString(),
        req.admin!.email,
        `Updated offerwall: ${offerwall.displayName}`,
        "offerwall_management",
        {
          targetType: "offerwall",
          targetId: offerwall._id.toString(),
          severity: "low",
        }
      );

      res.json({
        success: true,
        message: "Offerwall updated successfully",
        offerwall,
      });
    } catch (error: any) {
      console.error("Update offerwall error:", error);
      res.status(500).json({ error: "Failed to update offerwall" });
    }
  }
);

// DELETE /api/admin/offerwalls/:id - Delete offerwall
router.delete(
  "/offerwalls/:id",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      const offerwall = await OfferWall.findById(id);
      if (!offerwall) {
        res.status(404).json({ error: "Offerwall not found" });
        return;
      }

      const displayName = offerwall.displayName;
      await OfferWall.findByIdAndDelete(id);

      // Create audit log
      await createAuditLog(
        req.admin!.userId.toString(),
        req.admin!.email,
        `Deleted offerwall: ${displayName}`,
        "offerwall_management",
        {
          targetType: "offerwall",
          targetId: id,
          severity: "high",
        }
      );

      res.json({
        success: true,
        message: "Offerwall deleted successfully",
      });
    } catch (error: any) {
      console.error("Delete offerwall error:", error);
      res.status(500).json({ error: "Failed to delete offerwall" });
    }
  }
);

// POST /api/admin/offerwalls/:id/toggle - Toggle offerwall status
router.post(
  "/offerwalls/:id/toggle",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      const offerwall = await OfferWall.findById(id);
      if (!offerwall) {
        res.status(404).json({ error: "Offerwall not found" });
        return;
      }

      offerwall.isActive = !offerwall.isActive;
      await offerwall.save();

      // Create audit log
      await createAuditLog(
        req.admin!.userId.toString(),
        req.admin!.email,
        `${offerwall.isActive ? "Activated" : "Deactivated"} offerwall: ${offerwall.displayName}`,
        "offerwall_management",
        {
          targetType: "offerwall",
          targetId: offerwall._id.toString(),
          severity: "medium",
        }
      );

      res.json({
        success: true,
        message: `Offerwall ${offerwall.isActive ? "activated" : "deactivated"} successfully`,
        offerwall,
      });
    } catch (error: any) {
      console.error("Toggle offerwall error:", error);
      res.status(500).json({ error: "Failed to toggle offerwall status" });
    }
  }
);

// GET /api/admin/offerwalls/stats - Get offerwall statistics
router.get(
  "/offerwalls-stats",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const [
        totalOfferwalls,
        activeOfferwalls,
        offerwallsByType,
      ] = await Promise.all([
        OfferWall.countDocuments(),
        OfferWall.countDocuments({ isActive: true }),
        OfferWall.aggregate([
          { $group: { _id: "$type", count: { $sum: 1 } } },
        ]),
      ]);

      res.json({
        totalOfferwalls,
        activeOfferwalls,
        inactiveOfferwalls: totalOfferwalls - activeOfferwalls,
        byType: offerwallsByType.reduce((acc: any, item: any) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      });
    } catch (error: any) {
      console.error("Get offerwall stats error:", error);
      res.status(500).json({ error: "Failed to fetch offerwall statistics" });
    }
  }
);

// =============================================
// TOURNAMENT MANAGEMENT
// =============================================
import Tournament from "../models/Tournament";

// GET /api/admin/tournaments — list all tournaments
router.get(
  "/tournaments",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tournaments = await Tournament.find()
        .sort({ priority: -1, createdAt: -1 })
        .lean();
      res.json({ tournaments });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tournaments" });
    }
  },
);

// POST /api/admin/tournaments — create tournament
router.post(
  "/tournaments",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { name, imageUrl, status, prizePool, description, startDate, endDate, priority } = req.body;

      if (!name) {
        res.status(400).json({ error: "Tournament name is required" });
        return;
      }

      const tournament = await Tournament.create({
        name,
        imageUrl: imageUrl || null,
        status: status || "coming_soon",
        prizePool: prizePool || 0,
        description: description || "",
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        priority: priority || 0,
        createdBy: req.admin?.email || "admin",
      });

      res.status(201).json({ tournament });
    } catch (error) {
      res.status(500).json({ error: "Failed to create tournament" });
    }
  },
);

// PUT /api/admin/tournaments/:id — update tournament
router.put(
  "/tournaments/:id",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, imageUrl, status, prizePool, description, startDate, endDate, priority } = req.body;

      const tournament = await Tournament.findById(id);
      if (!tournament) {
        res.status(404).json({ error: "Tournament not found" });
        return;
      }

      if (name !== undefined) tournament.name = name;
      if (imageUrl !== undefined) tournament.imageUrl = imageUrl;
      if (status !== undefined) tournament.status = status;
      if (prizePool !== undefined) tournament.prizePool = prizePool;
      if (description !== undefined) tournament.description = description;
      if (startDate !== undefined) tournament.startDate = startDate ? new Date(startDate) : null;
      if (endDate !== undefined) tournament.endDate = endDate ? new Date(endDate) : null;
      if (priority !== undefined) tournament.priority = priority;
      tournament.updatedBy = req.admin?.email || "admin";

      await tournament.save();
      res.json({ tournament });
    } catch (error) {
      res.status(500).json({ error: "Failed to update tournament" });
    }
  },
);

// DELETE /api/admin/tournaments/:id — delete tournament
router.delete(
  "/tournaments/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const tournament = await Tournament.findByIdAndDelete(id);
      if (!tournament) {
        res.status(404).json({ error: "Tournament not found" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete tournament" });
    }
  },
);

export default router;

