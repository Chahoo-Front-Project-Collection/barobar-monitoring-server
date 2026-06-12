import { ReplaysController } from './replays.controller';
import { ReplaysService } from './replays.service';
import { ReplayRateLimitService } from './replay-rate-limit.service';
import { CreateReplayDto } from './replays.dto';

describe('ReplaysController', () => {
  it('rate-limits by public key, origin, and forwarded client IP before creating a replay', () => {
    const create = jest.fn().mockResolvedValue({ replay_id: 'replay_1' });
    const replaysService = {
      create,
    } as unknown as ReplaysService;
    const assertAllowed = jest.fn();
    const rateLimit = {
      assertAllowed,
    } as unknown as ReplayRateLimitService;
    const controller = new ReplaysController(replaysService, rateLimit);
    const dto = {
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

    expect(assertAllowed).toHaveBeenCalledWith({
      publicKey: 'public',
      origin: 'https://service.test',
      ip: '203.0.113.10',
    });
    expect(create).toHaveBeenCalledWith(dto, 'https://service.test');
  });
});
