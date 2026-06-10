import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { CookieOptions } from 'express';

export interface AdminSession {
  username: string;
}

interface AdminSessionPayload {
  username: string;
  exp: number;
}

interface AdminAuthConfig {
  username: string;
  password: string;
  sessionSecret: string;
  ttlSeconds: number;
}

export interface IssuedAdminSession {
  username: string;
  cookieValue: string;
  expiresAt: Date;
}

@Injectable()
export class AdminAuthService {
  get cookieName() {
    return process.env.ADMIN_SESSION_COOKIE_NAME ?? 'barobar_admin_session';
  }

  login(
    username: string,
    password: string,
    now = new Date(),
  ): IssuedAdminSession {
    const config = this.getConfig();
    if (username !== config.username || !safeEqual(password, config.password)) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    const expiresAt = new Date(now.getTime() + config.ttlSeconds * 1000);
    const payload: AdminSessionPayload = {
      username,
      exp: Math.floor(expiresAt.getTime() / 1000),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = this.sign(encodedPayload, config.sessionSecret);

    return {
      username,
      cookieValue: `${encodedPayload}.${signature}`,
      expiresAt,
    };
  }

  verifyCookieHeader(cookieHeader?: string, now = new Date()): AdminSession {
    const cookieValue = parseCookieHeader(cookieHeader)[this.cookieName];
    if (!cookieValue) {
      throw new UnauthorizedException('Admin login required');
    }
    return this.verifyCookieValue(cookieValue, now);
  }

  cookieOptions(expiresAt: Date): CookieOptions {
    return {
      expires: expiresAt,
      httpOnly: true,
      path: '/api/admin',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    };
  }

  clearCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      path: '/api/admin',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    };
  }

  private verifyCookieValue(cookieValue: string, now: Date): AdminSession {
    const config = this.getConfig();
    const [encodedPayload, signature] = cookieValue.split('.');
    if (!encodedPayload || !signature) {
      throw new UnauthorizedException('Invalid admin session');
    }

    const expectedSignature = this.sign(encodedPayload, config.sessionSecret);
    if (!safeEqual(signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid admin session');
    }

    const payload = parsePayload(encodedPayload);
    if (!payload || payload.exp * 1000 <= now.getTime()) {
      throw new UnauthorizedException('Admin session expired');
    }

    return { username: payload.username };
  }

  private sign(payload: string, secret: string) {
    return createHmac('sha256', secret).update(payload).digest('base64url');
  }

  private getConfig(): AdminAuthConfig {
    const username = process.env.ADMIN_USERNAME?.trim() || 'admin';
    const password = process.env.ADMIN_PASSWORD;
    const sessionSecret = process.env.ADMIN_SESSION_SECRET;
    if (!password || !sessionSecret) {
      throw new InternalServerErrorException('Admin auth is not configured');
    }

    return {
      username,
      password,
      sessionSecret,
      ttlSeconds: parsePositiveInt(
        process.env.ADMIN_SESSION_TTL_SECONDS,
        8 * 60 * 60,
      ),
    };
  }
}

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader
    .split(';')
    .reduce<Record<string, string>>((cookies, part) => {
      const [rawName, ...rawValue] = part.trim().split('=');
      if (!rawName || rawValue.length === 0) return cookies;
      cookies[rawName] = decodeURIComponent(rawValue.join('='));
      return cookies;
    }, {});
}

function parsePayload(encodedPayload: string): AdminSessionPayload | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Partial<AdminSessionPayload>;
    if (typeof parsed.username !== 'string' || typeof parsed.exp !== 'number') {
      return null;
    }
    return { username: parsed.username, exp: parsed.exp };
  } catch {
    return null;
  }
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
