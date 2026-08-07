import type { Request, Response } from 'express';

const mockEnv = {
  isProduction: false,
  cors: { origin: 'http://localhost:5173' },
};

jest.mock('../../config/env', () => ({ env: mockEnv }));

import { clearAuthCookie, setAuthCookie } from '../cookies';

function createRequest(headers: Record<string, string>): Request {
  return {
    protocol: 'https',
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function createResponse(): { response: Response; setHeader: jest.Mock } {
  const setHeader = jest.fn();
  return { response: { setHeader } as unknown as Response, setHeader };
}

describe('auth cookies', () => {
  const originalProduction = mockEnv.isProduction;
  const originalOrigin = mockEnv.cors.origin;

  afterEach(() => {
    mockEnv.isProduction = originalProduction;
    mockEnv.cors.origin = originalOrigin;
  });

  it('uses Secure SameSite=None for an allowed production cross-origin request', () => {
    mockEnv.isProduction = true;
    mockEnv.cors.origin = 'https://tcgtracker.pages.dev';
    const req = createRequest({
      origin: 'https://tcgtracker.pages.dev',
      host: 'tcgtracker-api.onrender.com',
      'x-forwarded-proto': 'https',
    });
    const { response, setHeader } = createResponse();

    setAuthCookie(response, 'token', req);

    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('SameSite=None'));
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('Secure'));
  });

  it('keeps local development cookies SameSite=Lax without Secure', () => {
    mockEnv.isProduction = false;
    mockEnv.cors.origin = 'http://localhost:5173';
    const req = createRequest({
      origin: 'http://localhost:5173',
      host: 'localhost:3001',
    });
    const { response, setHeader } = createResponse();

    clearAuthCookie(response, req);

    const cookie = setHeader.mock.calls[0][1] as string;
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
  });
});
