import { beforeAll, afterAll, describe, expect, it, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { Database } from 'sqlite3';
import type { AuthRequest } from '../../middleware/auth';

const mockEnv = {
  admin: { username: 'admin', bootstrapEmail: 'owner@example.com' },
  authBypassEnabled: false,
  bcrypt: { rounds: 4 },
  isDevelopment: false,
  isProduction: false,
  jwt: {
    secret: 'test-secret-that-is-at-least-thirty-two-characters',
    expiresIn: '7d',
  },
};

jest.mock('../../config/env', () => ({ env: mockEnv }));

import { requireAdmin } from '../../middleware/admin';
import { AuthService } from '../authService';

describe('AuthService authorization', () => {
  const db = new Database(':memory:');
  const authService = new AuthService(db);
  const originalBypass = mockEnv.authBypassEnabled;

  beforeAll(async () => {
    mockEnv.authBypassEnabled = false;
    await authService.init();
  });

  afterAll(
    () =>
      new Promise<void>((resolve, reject) => {
        mockEnv.authBypassEnabled = originalBypass;
        db.close((error) => (error ? reject(error) : resolve()));
      })
  );

  it('does not grant admin access when a user changes their username or submits a role', async () => {
    const registered = await authService.register(
      'member',
      'member@example.com',
      'correct horse battery staple'
    );

    await authService.updateUser(registered.user.id, {
      username: mockEnv.admin.username,
      role: 'admin',
    } as { username: string; role: string });

    const loggedIn = await authService.login('member@example.com', 'correct horse battery staple');
    const claims = jwt.verify(loggedIn.token, mockEnv.jwt.secret) as NonNullable<
      AuthRequest['user']
    >;
    const next = jest.fn();
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    requireAdmin({ user: claims } as unknown as AuthRequest, response as any, next);

    expect(claims.role).toBe('user');
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it('reserves the bootstrap administrator email until the account already exists', async () => {
    await expect(
      authService.register('attacker', mockEnv.admin.bootstrapEmail, 'correct horse battery staple')
    ).rejects.toThrow('Register this account before configuring ADMIN_BOOTSTRAP_EMAIL');
  });
});
