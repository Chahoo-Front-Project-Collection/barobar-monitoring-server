import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface ReplayRateLimitRequest {
  tenantId: string;
  publicKey: string;
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
      `tenant:${request.tenantId}:${request.publicKey}`,
      readPositiveInt(process.env.REPLAY_TENANT_RATE_LIMIT_PER_MINUTE, 60),
      now,
    );
    this.assertBucketAllowed(
      `ip:${request.ip}`,
      readPositiveInt(process.env.REPLAY_IP_RATE_LIMIT_PER_MINUTE, 120),
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

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
