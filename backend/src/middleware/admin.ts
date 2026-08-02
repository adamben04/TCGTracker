import { Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AuthRequest, authenticate } from './auth';

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.username === env.admin.username) {
    next();
    return;
  }
  res.status(403).json({ error: 'Admin access required' });
};

/**
 * Skip auth only when explicitly opted in for local development.
 * Fails closed: production (or an unset NODE_ENV) always requires admin auth.
 */
export const requireAdminUnlessDev = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (env.isDevelopment && env.authBypassEnabled) {
    next();
    return;
  }
  authenticate(req, res, () => requireAdmin(req, res, next));
};
