import { ReplaysController } from './replays.controller';
import { ReplaysService } from './replays.service';
import { ReplayRateLimitService } from './replay-rate-limit.service';
import { CreateReplayDto } from './replays.dto';

describe('ReplaysController', () => {
  it('rate-limits by tenant/public key and forwarded client IP before creating a replay', () => {
    const replaysService = {
      create: jest.fn().mockResolvedValue({ replay_id: 'replay_1' }),
    } as unknown as ReplaysService;
    const rateLimit = {
      assertAllowed: jest.fn(),
    } as unknown as ReplayRateLimitService;
    const controller = new ReplaysController(replaysService, rateLimit);
    const dto = {
      tenant_id: 'demo',
      public_key: 'public',
    } as CreateReplayDto;
    const request = {
      headers: {
        origin: 'https://service.test',
        'x-forwarded-for': '203.0.113.10, 127.0.0.1',
      },
      ip: '127.0.0.1',
    };

    void controller.create(dto, request as never);

    expect(rateLimit.assertAllowed).toHaveBeenCalledWith({
      tenantId: 'demo',
      publicKey: 'public',
      ip: '203.0.113.10',
    });
    expect(replaysService.create).toHaveBeenCalledWith(
      dto,
      'https://service.test',
    );
  });
});
