import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'please-change-this-secret';

export default async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.header('authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing or invalid Authorization header' });
    }

    const token = auth.slice(7).trim();
    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET) as any;
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const userId = payload.sub;
    if (!userId) return res.status(401).json({ message: 'Token missing subject claim' });

    const user = await User.findById(userId).exec();
    if (!user) return res.status(401).json({ message: 'User not found for token' });

    (req as any).user = user;
    (req as any).authToken = token;
    next();
  } catch (err) {
    next(err);
  }
}
