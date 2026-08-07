import { Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AuthRequest } from './auth';

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  const bypassEnabled =
    env.authBypassEnabled === true && env.isDevelopment === true && env.isProduction === false;

  if (req.user?.role === 'admin') {
    next();
    return;
  }

  if (bypassEnabled) {
    next();
    return;
  }

  res.status(403).json({ error: 'Admin access required' });
};
