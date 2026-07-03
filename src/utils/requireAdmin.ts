import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import AdminUser from "../models/AdminUser";

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

export interface AdminRequest extends Request {
  admin?: {
    userId: string;
    email: string;
    role: string;
    permissions: string[];
  };
}

export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized: No token provided" });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      email: string;
      role: string;
      permissions: string[];
    };

    // Verify admin user exists and is active
    const admin = await AdminUser.findById(decoded.userId);
    if (!admin) {
      res.status(401).json({ error: "Unauthorized: Admin user not found" });
      return;
    }

    if (!admin.isActive) {
      res.status(403).json({ error: "Forbidden: Admin account is disabled" });
      return;
    }

    // Check if account is locked
    if (admin.isLocked()) {
      res.status(403).json({
        error:
          "Forbidden: Account locked due to too many failed login attempts",
      });
      return;
    }

    // Attach admin info to request
    (req as AdminRequest).admin = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      permissions: decoded.permissions || [],
    };

    next();
  } catch (error: any) {
    console.error("Admin auth error:", error);
    if (error.name === "JsonWebTokenError") {
      res.status(401).json({ error: "Unauthorized: Invalid token" });
      return;
    }
    if (error.name === "TokenExpiredError") {
      res.status(401).json({ error: "Unauthorized: Token expired" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
    return;
  }
};

// Middleware to check specific permissions
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const adminReq = req as AdminRequest;

    if (!adminReq.admin) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Superadmin has all permissions
    if (adminReq.admin.role === "superadmin") {
      next();
      return;
    }

    // Check if user has wildcard permission
    if (adminReq.admin.permissions.includes("*")) {
      next();
      return;
    }

    // Check if user has specific permission
    if (adminReq.admin.permissions.includes(permission)) {
      next();
      return;
    }

    res.status(403).json({ error: "Forbidden: Insufficient permissions" });
    return;
  };
};

// Middleware to require specific role
export const requireRole = (roles: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const adminReq = req as AdminRequest;

    if (!adminReq.admin) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (allowedRoles.includes(adminReq.admin.role)) {
      next();
      return;
    }

    res.status(403).json({ error: "Forbidden: Insufficient role" });
    return;
  };
};
