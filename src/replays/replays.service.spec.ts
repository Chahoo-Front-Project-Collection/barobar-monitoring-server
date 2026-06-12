import { ReplaysService } from './replays.service';
import { ReplayStorageService } from './replay-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReplayDto } from './replays.dto';
import { TenantGuardService } from '../tenant/tenant-guard.service';

describe('ReplaysService', () => {
  it('stores replay data under the tenant matched by public key and origin', async () => {
    const tx = {
      error: {
        upsert: jest.fn().mockResolvedValue({ id: 'error_1' }),
      },
      errorEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event_1' }),
      },
      replay: {
        create: jest.fn().mockResolvedValue({ id: 'replay_1' }),
      },
    };
    const transaction = jest.fn(
      (callback: (transactionClient: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );
    const prisma = {
      $transaction: transaction,
    } as unknown as PrismaService;
    const validate = jest.fn().mockResolvedValue({
      id: 'tenant_1',
      slug: 'barobar-prod',
    });
    const tenantGuard = {
      validate,
    } as unknown as TenantGuardService;
    const save = jest.fn().mockResolvedValue({
      storageKey: 'replays/barobar-prod/replay_1.json.gz',
      sizeBytes: 123,
    });
    const storage = {
      save,
      delete: jest.fn(),
    } as unknown as ReplayStorageService;
    const service = new ReplaysService(prisma, tenantGuard, storage);

    const result = await service.create(
      createReplayDto(),
      'https://service.test',
    );

    expect(validate).toHaveBeenCalledWith('public', 'https://service.test');
    expect(save).toHaveBeenCalledWith(
      'barobar-prod',
      expect.stringMatching(/^replay_/),
      expect.any(Object),
    );
    expect(result).toEqual({
      replay_id: 'replay_1',
      error_event_id: 'event_1',
      error_id: 'error_1',
    });
  });
});

function createReplayDto(): CreateReplayDto {
  return {
    public_key: 'public',
    session_id: 'session_1',
    version: '1.0.0',
    environment: 'production',
    page_url: 'https://service.test/page',
    error: {
      type: 'http_error',
      name: 'AxiosError',
      message: 'Request failed with status code 500',
      status_code: 500,
      request_url: '/api/failing',
    },
    replay: {
      events: [],
      duration_ms: 1000,
      started_at: 1,
      ended_at: 2,
    },
    occurred_at: '2026-06-12T00:00:00.000Z',
  };
}
