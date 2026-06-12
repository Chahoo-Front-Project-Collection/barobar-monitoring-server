import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const REPLAY_PUBLIC_KEY_RATE_LIMIT_PER_MINUTE = 60;
const REPLAY_ORIGIN_RATE_LIMIT_PER_MINUTE = 60;
const REPLAY_IP_RATE_LIMIT_PER_MINUTE = 120;

interface ReplayRateLimitRequest {
  publicKey: string;
  origin?: string;
  ip: string;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class ReplayRateLimitService {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly windowMs = 60_000;

  assertAllowed(request: ReplayRateLimitRequest, now = Date.now()) {
    this.assertBucketAllowed(
      `public-key:${request.publicKey}`,
      REPLAY_PUBLIC_KEY_RATE_LIMIT_PER_MINUTE,
      now,
    );
    this.assertBucketAllowed(
      `origin:${request.origin ?? 'no-origin'}`,
      REPLAY_ORIGIN_RATE_LIMIT_PER_MINUTE,
      now,
    );
    this.assertBucketAllowed(
      `ip:${request.ip}`,
      REPLAY_IP_RATE_LIMIT_PER_MINUTE,
      now,
    );
  }

  private assertBucketAllowed(key: string, limit: number, now: number) {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }

    if (bucket.count >= limit) {
      throw new HttpException(
        'Replay rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
  }
}
