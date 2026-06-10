import { ReplayStorageService } from '../replays/replay-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DiskUsageSnapshot,
  StorageDiskUsageService,
} from './storage-disk-usage.service';
import { ReplayCleanupService } from './replay-cleanup.service';

describe('ReplayCleanupService', () => {
  const originalEnv = process.env;
  let prisma: {
    replay: { findMany: jest.Mock; delete: jest.Mock };
    errorEvent: { delete: jest.Mock };
    $transaction: jest.Mock;
  };
  let storage: { delete: jest.Mock };
  let diskUsage: { getUsage: jest.Mock<Promise<DiskUsageSnapshot>, [string]> };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      STORAGE_PATH: '/data/storage',
      REPLAY_CLEANUP_START_USAGE_PERCENT: '80',
      REPLAY_CLEANUP_STOP_USAGE_PERCENT: '70',
    };
    prisma = {
      replay: {
        findMany: jest.fn(),
        delete: jest.fn((args) => ({ model: 'replay', args })),
      },
      errorEvent: {
        delete: jest.fn((args) => ({ model: 'errorEvent', args })),
      },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    storage = { delete: jest.fn().mockResolvedValue(undefined) };
    diskUsage = { getUsage: jest.fn() };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function service() {
    return new ReplayCleanupService(
      prisma as unknown as PrismaService,
      storage as unknown as ReplayStorageService,
      diskUsage as unknown as StorageDiskUsageService,
    );
  }

  function usage(usedPercent: number): DiskUsageSnapshot {
    return {
      usedPercent,
      totalBytes: 30 * 1024 * 1024 * 1024,
      availableBytes: 30 * 1024 * 1024 * 1024 * (1 - usedPercent / 100),
    };
  }

  it('does nothing when disk usage is below the cleanup start threshold', async () => {
    diskUsage.getUsage.mockResolvedValue(usage(79));

    const result = await service().run();

    expect(result).toMatchObject({
      cleanupStarted: false,
      deletedReplayCount: 0,
      deletedFileCount: 0,
    });
    expect(prisma.replay.findMany).not.toHaveBeenCalled();
  });

  it('deletes oldest replay rows, linked error events, and gzip files under disk pressure', async () => {
    diskUsage.getUsage
      .mockResolvedValueOnce(usage(85))
      .mockResolvedValueOnce(usage(69));
    prisma.replay.findMany.mockResolvedValue([
      {
        id: 'replay_oldest',
        errorEventId: 'event_oldest',
        storageKey: 'replays/demo/replay_oldest.json.gz',
        sizeBytes: 190_000,
        createdAt: new Date('2026-06-09T00:00:00.000Z'),
      },
    ]);

    const result = await service().run({ batchSize: 100 });

    expect(prisma.replay.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        errorEventId: true,
        storageKey: true,
        sizeBytes: true,
        createdAt: true,
      },
      take: 100,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      { model: 'replay', args: { where: { id: 'replay_oldest' } } },
      { model: 'errorEvent', args: { where: { id: 'event_oldest' } } },
    ]);
    expect(storage.delete).toHaveBeenCalledWith(
      'replays/demo/replay_oldest.json.gz',
    );
    expect(result).toMatchObject({
      cleanupStarted: true,
      deletedReplayCount: 1,
      deletedErrorEventCount: 1,
      deletedFileCount: 1,
      deletedBytes: 190_000,
      initialUsedPercent: 85,
      finalUsedPercent: 69,
    });
  });

  it('supports dry-run without deleting database rows or files', async () => {
    diskUsage.getUsage.mockResolvedValue(usage(85));
    prisma.replay.findMany.mockResolvedValue([
      {
        id: 'replay_oldest',
        errorEventId: 'event_oldest',
        storageKey: 'replays/demo/replay_oldest.json.gz',
        sizeBytes: 190_000,
        createdAt: new Date('2026-06-09T00:00:00.000Z'),
      },
    ]);

    const result = await service().run({ dryRun: true });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      dryRun: true,
      cleanupStarted: true,
      candidateReplayCount: 1,
      deletedReplayCount: 0,
      deletedFileCount: 0,
      estimatedBytes: 190_000,
    });
  });
});
