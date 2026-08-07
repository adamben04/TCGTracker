import { Request, Response } from 'express';
import { env } from '../config/env';

export const AUTH_COOKIE_NAME = 'tcg_token';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isAllowedCrossOriginRequest(req?: Request): boolean {
  if (!req || !env.isProduction) return false;

  const origin = req.get('origin');
  if (!origin) return false;

  const allowedOrigins = env.cors.origin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowedOrigins.includes(origin)) return false;

  const host = req.get('x-forwarded-host') || req.get('host');
  if (!host) return false;

  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0].trim();
  const protocol = forwardedProtocol || req.protocol;
  return origin !== `${protocol}://${host}`;
}

function authCookieParts(req?: Request): string[] {
  const crossOrigin = isAllowedCrossOriginRequest(req);

  return [
    'HttpOnly',
    'Path=/',
    `SameSite=${crossOrigin ? 'None' : 'Lax'}`,
    ...(env.isProduction ? ['Secure'] : []),
  ];
}

export function setAuthCookie(res: Response, token: string, req?: Request): void {
  const parts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    ...authCookieParts(req),
    `Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`,
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearAuthCookie(res: Response, req?: Request): void {
  const parts = [`${AUTH_COOKIE_NAME}=`, ...authCookieParts(req), 'Max-Age=0'];
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function getAuthCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${AUTH_COOKIE_NAME}=`)) {
      return decodeURIComponent(trimmed.slice(AUTH_COOKIE_NAME.length + 1));
    }
  }
  return undefined;
}
