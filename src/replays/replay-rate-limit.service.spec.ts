import { HttpException, HttpStatus } from '@nestjs/common';
import { ReplayRateLimitService } from './replay-rate-limit.service';

describe('ReplayRateLimitService', () => {
  it('limits replay requests by origin', () => {
    const service = new ReplayRateLimitService();
    const request = {
      publicKey: 'public',
      origin: 'https://service.test',
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

  it('limits replay requests by IP across origins', () => {
    const service = new ReplayRateLimitService();

    for (let count = 0; count < 120; count += 1) {
      service.assertAllowed(
        {
          origin: `https://service-${count}.test`,
          publicKey: `public-${count}`,
          ip: '203.0.113.10',
        },
        1_000 + count,
      );
    }

    expect(() =>
      service.assertAllowed(
        {
          origin: 'https://service-over-limit.test',
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
      publicKey: 'public',
      origin: 'https://service.test',
      ip: '203.0.113.10',
    };

    for (let count = 0; count < 60; count += 1) {
      service.assertAllowed(request, 1_000 + count);
    }
    service.assertAllowed(request, 61_000);

    expect(() => service.assertAllowed(request, 61_001)).not.toThrow();
  });
});
