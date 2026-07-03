"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const JWT_SECRET = process.env.JWT_SECRET || 'please-change-this-secret';
async function requireAuth(req, res, next) {
    try {
        const auth = req.header('authorization');
        if (!auth || !auth.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Missing or invalid Authorization header' });
        }
        const token = auth.slice(7).trim();
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        }
        catch (err) {
            return res.status(401).json({ message: 'Invalid or expired token' });
        }
        const userId = payload.sub;
        if (!userId)
            return res.status(401).json({ message: 'Token missing subject claim' });
        const user = await User_1.default.findById(userId).exec();
        if (!user)
            return res.status(401).json({ message: 'User not found for token' });
        req.user = user;
        req.authToken = token;
        next();
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=requireAuth.js.map