import type { NextFunction, Request, Response } from 'express';
import { csrfProtection } from '../csrf';

function responseStub() {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as Response;
}

function requestStub(method: string, headers: Record<string, string> = {}): Request {
  return {
    method,
    headers,
  } as unknown as Request;
}

describe('csrfProtection', () => {
  it('allows safe methods without origin headers', () => {
    const next = jest.fn() as NextFunction;

    csrfProtection(requestStub('GET'), responseStub(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('allows unauthenticated writes without origin headers', () => {
    const next = jest.fn() as NextFunction;

    csrfProtection(requestStub('POST'), responseStub(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects cookie-authenticated writes without origin or referer', () => {
    const response = responseStub();
    const next = jest.fn() as NextFunction;

    csrfProtection(requestStub('POST', { cookie: 'tcg_token=session-token' }), response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it('allows bearer-token clients without browser origin headers', () => {
    const next = jest.fn() as NextFunction;

    csrfProtection(
      requestStub('POST', { authorization: 'Bearer api-client-token' }),
      responseStub(),
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('allows writes from the configured frontend origin', () => {
    const next = jest.fn() as NextFunction;

    csrfProtection(requestStub('POST', { origin: 'http://localhost:5173' }), responseStub(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
