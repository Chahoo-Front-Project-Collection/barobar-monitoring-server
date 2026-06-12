import { HttpException, HttpStatus } from '@nestjs/common';
import { ReplayRateLimitService } from './replay-rate-limit.service';

describe('ReplayRateLimitService', () => {
  it('limits replay requests by tenant and public key', () => {
    const service = new ReplayRateLimitService();
    const request = {
      tenantId: 'demo',
      publicKey: 'public',
      ip: '203.0.113.10',
    };

    for (let count = 0; count < 60; count += 1) {
      service.assertAllowed(request, 1_000 + count);
    }

    expect(() => service.assertAllowed(request, 1_060)).toThrow(
      new HttpException(
        'Replay rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );
  });

  it('limits replay requests by IP across tenants', () => {
    const service = new ReplayRateLimitService();

    for (let count = 0; count < 120; count += 1) {
      service.assertAllowed(
        {
          tenantId: `demo-${count}`,
          publicKey: `public-${count}`,
          ip: '203.0.113.10',
        },
        1_000 + count,
      );
    }

    expect(() =>
      service.assertAllowed(
        {
          tenantId: 'demo-over-limit',
          publicKey: 'public-over-limit',
          ip: '203.0.113.10',
        },
        1_120,
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

    for (let count = 0; count < 60; count += 1) {
      service.assertAllowed(request, 1_000 + count);
    }
    service.assertAllowed(request, 61_000);

    expect(() => service.assertAllowed(request, 61_001)).not.toThrow();
  });
});
