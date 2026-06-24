import { PrismaService } from '../prisma/prisma.service';
import { ReplayStorageService } from '../replays/replay-storage.service';
import { LoadTestCleanupService } from './load-test-cleanup.service';

describe('LoadTestCleanupService', () => {
  let prisma: {
    errorEvent: { findMany: jest.Mock; deleteMany: jest.Mock };
    replay: { deleteMany: jest.Mock };
    error: { deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let storage: { delete: jest.Mock };

  beforeEach(() => {
    prisma = {
      errorEvent: {
        findMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      replay: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      error: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };
    storage = {
      delete: jest.fn().mockResolvedValue(undefined),
    };
  });

  function service() {
    return new LoadTestCleanupService(
      prisma as unknown as PrismaService,
      storage as unknown as ReplayStorageService,
    );
  }

  it('defaults to dry-run and does not delete database rows or files', async () => {
    prisma.errorEvent.findMany.mockResolvedValue(targets());

    const result = await service().run({ version: '3.7.0' });

    expect(prisma.errorEvent.findMany).toHaveBeenCalledWith({
      where: { version: '3.7.0' },
      select: {
        id: true,
        errorId: true,
        replay: {
          select: {
            id: true,
            storageKey: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      version: '3.7.0',
      dryRun: true,
      errorEventCount: 2,
      replayCount: 2,
      deletedErrorEventCount: 0,
      deletedReplayCount: 0,
      deletedFileCount: 0,
    });
  });

  it('deletes version 3.7.0 replays, events, orphan errors, and files when confirmed', async () => {
    prisma.errorEvent.findMany.mockResolvedValue(targets());

    const result = await service().run({
      version: '3.7.0',
      dryRun: false,
    });

    expect(prisma.replay.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['replay_1', 'replay_2'] } },
    });
    expect(prisma.errorEvent.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['event_1', 'event_2'] } },
    });
    expect(prisma.error.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['error_1'] },
        errorEvents: { none: {} },
      },
    });
    expect(storage.delete).toHaveBeenCalledWith('replays/demo/replay_1.json.gz');
    expect(storage.delete).toHaveBeenCalledWith('replays/demo/replay_2.json.gz');
    expect(result).toMatchObject({
      dryRun: false,
      deletedErrorEventCount: 2,
      deletedReplayCount: 2,
      deletedErrorCount: 1,
      deletedFileCount: 2,
      failedFileCount: 0,
    });
  });
});

function targets() {
  return [
    {
      id: 'event_1',
      errorId: 'error_1',
      replay: {
        id: 'replay_1',
        storageKey: 'replays/demo/replay_1.json.gz',
      },
    },
    {
      id: 'event_2',
      errorId: 'error_1',
      replay: {
        id: 'replay_2',
        storageKey: 'replays/demo/replay_2.json.gz',
      },
    },
  ];
}
