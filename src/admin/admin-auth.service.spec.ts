import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';

describe('AdminAuthService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'secret',
      ADMIN_SESSION_SECRET: 'test-session-secret',
      NODE_ENV: 'test',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('creates and verifies a signed admin session cookie', () => {
    const service = new AdminAuthService();
    const session = service.login(
      'admin',
      'secret',
      new Date('2026-06-10T00:00:00.000Z'),
    );

    const verified = service.verifyCookieHeader(
      `${service.cookieName}=${session.cookieValue}`,
      new Date('2026-06-10T00:01:00.000Z'),
    );

    expect(verified).toEqual({ username: 'admin' });
    expect(session.expiresAt).toEqual(new Date('2026-06-10T08:00:00.000Z'));
  });

  it('rejects invalid admin credentials', () => {
    const service = new AdminAuthService();

    expect(() => service.login('admin', 'wrong')).toThrow(
      UnauthorizedException,
    );
  });

  it('uses the configured admin username', () => {
    const service = new AdminAuthService();

    const session = service.login(
      'admin',
      'secret',
      new Date('2026-06-10T00:00:00.000Z'),
    );

    expect(session.username).toBe('admin');
  });

  it('fails closed when admin username is missing', () => {
    delete process.env.ADMIN_USERNAME;
    const service = new AdminAuthService();

    expect(() => service.login('admin', 'secret')).toThrow(
      InternalServerErrorException,
    );
  });

  it('rejects a tampered session cookie', () => {
    const service = new AdminAuthService();
    const session = service.login(
      'admin',
      'secret',
      new Date('2026-06-10T00:00:00.000Z'),
    );
    const tampered = session.cookieValue.replace(/.$/, 'x');

    expect(() =>
      service.verifyCookieHeader(
        `${service.cookieName}=${tampered}`,
        new Date('2026-06-10T00:01:00.000Z'),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rejects an expired session cookie', () => {
    const service = new AdminAuthService();
    const session = service.login(
      'admin',
      'secret',
      new Date('2026-06-10T00:00:00.000Z'),
    );

    expect(() =>
      service.verifyCookieHeader(
        `${service.cookieName}=${session.cookieValue}`,
        new Date('2026-06-10T08:00:01.000Z'),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('fails closed when admin auth secrets are missing', () => {
    delete process.env.ADMIN_SESSION_SECRET;
    const service = new AdminAuthService();

    expect(() => service.login('admin', 'secret')).toThrow(
      InternalServerErrorException,
    );
  });
});
