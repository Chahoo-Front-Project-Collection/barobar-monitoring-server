import { HttpException, HttpStatus } from '@nestjs/common';
import { ReplayRateLimitService } from './replay-rate-limit.service';

describe('ReplayRateLimitService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      REPLAY_TENANT_RATE_LIMIT_PER_MINUTE: '2',
      REPLAY_IP_RATE_LIMIT_PER_MINUTE: '2',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('limits replay requests by tenant and public key', () => {
    const service = new ReplayRateLimitService();
    const request = {
      tenantId: 'demo',
      publicKey: 'public',
      ip: '203.0.113.10',
    };

    service.assertAllowed(request, 1_000);
    service.assertAllowed(request, 1_001);

    expect(() => service.assertAllowed(request, 1_002)).toThrow(
      new HttpException('Replay rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS),
    );
  });

  it('limits replay requests by IP across tenants', () => {
    process.env.REPLAY_TENANT_RATE_LIMIT_PER_MINUTE = '10';
    const service = new ReplayRateLimitService();

    service.assertAllowed(
      { tenantId: 'demo-a', publicKey: 'a', ip: '203.0.113.10' },
      1_000,
    );
    service.assertAllowed(
      { tenantId: 'demo-b', publicKey: 'b', ip: '203.0.113.10' },
      1_001,
    );

    expect(() =>
      service.assertAllowed(
        { tenantId: 'demo-c', publicKey: 'c', ip: '203.0.113.10' },
        1_002,
      ),
    ).toThrow(HttpException);
  });

  it('resets counters after the window passes', () => {
    const service = new ReplayRateLimitService();
    const request = {
      tenantId: 'demo',
      publicKey: 'public',
      ip: '203.0.113.10',
    };

    service.assertAllowed(request, 1_000);
    service.assertAllowed(request, 1_001);
    service.assertAllowed(request, 61_000);

    expect(() => service.assertAllowed(request, 61_001)).not.toThrow();
  });
});
