"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.requirePermission = exports.requireAdmin = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const AdminUser_1 = __importDefault(require("../models/AdminUser"));
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const requireAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ error: "Unauthorized: No token provided" });
            return;
        }
        const token = authHeader.substring(7);
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        // Verify admin user exists and is active
        const admin = await AdminUser_1.default.findById(decoded.userId);
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
                error: "Forbidden: Account locked due to too many failed login attempts",
            });
            return;
        }
        // Attach admin info to request
        req.admin = {
            userId: decoded.userId,
            email: decoded.email,
            role: decoded.role,
            permissions: decoded.permissions || [],
        };
        next();
    }
    catch (error) {
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
exports.requireAdmin = requireAdmin;
// Middleware to check specific permissions
const requirePermission = (permission) => {
    return (req, res, next) => {
        const adminReq = req;
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
exports.requirePermission = requirePermission;
// Middleware to require specific role
const requireRole = (roles) => {
    return (req, res, next) => {
        const adminReq = req;
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
exports.requireRole = requireRole;
//# sourceMappingURL=requireAdmin.js.map