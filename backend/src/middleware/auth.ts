import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { getAuthCookie } from '../utils/cookies';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    username: string;
    role: 'user' | 'admin';
  };
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  const cookieToken = getAuthCookie(req.headers.cookie);
  return cookieToken ?? null;
}

function verifyToken(token: string): NonNullable<AuthRequest['user']> {
  const payload = jwt.verify(token, env.jwt.secret) as {
    id: number;
    email: string;
    username: string;
    role?: string;
  };

  return {
    id: payload.id,
    email: payload.email,
    username: payload.username,
    // Tokens issued before roles existed are deliberately non-admin.
    role: payload.role === 'admin' ? 'admin' : 'user',
  };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    req.user = verifyToken(token);
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

export const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const token = extractToken(req);
    if (token) {
      req.user = verifyToken(token);
    }
    next();
  } catch {
    next();
  }
};
