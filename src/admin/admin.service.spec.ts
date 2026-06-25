import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReplayStorageService } from '../replays/replay-storage.service';

interface ErrorFindManyArgs {
  where: {
    environment?: string;
    lastSeenAt?: { gte?: Date; lt?: Date };
    message?: { contains: string; mode: 'insensitive' };
    version?: { contains: string; mode: 'insensitive' };
  };
  skip?: number;
  take?: number;
}

describe('AdminService.getErrors', () => {
  let service: AdminService;
  let findMany: jest.Mock<unknown, [ErrorFindManyArgs]>;
  let count: jest.Mock;

  beforeEach(() => {
    findMany = jest.fn<unknown, [ErrorFindManyArgs]>().mockReturnValue([]);
    count = jest.fn().mockReturnValue(0);
    const prisma = {
      error: { findMany, count },
      $transaction: (ops: unknown[]) => Promise.resolve(ops),
    } as unknown as PrismaService;
    const storage = {} as ReplayStorageService;
    service = new AdminService(prisma, storage);
  });

  function lastFindManyArgs(): ErrorFindManyArgs {
    const [args] = findMany.mock.calls[0] ?? [];
    if (!args) {
      throw new Error('findMany was not called');
    }
    return args;
  }

  it('searches message with a case-insensitive substring match', async () => {
    await service.getErrors({ message: 'timeout' });

    expect(lastFindManyArgs().where).toMatchObject({
      message: { contains: 'timeout', mode: 'insensitive' },
    });
  });

  it('keeps environment as an exact match and searches version as a substring', async () => {
    await service.getErrors({ environment: 'production', version: '3.2.0' });

    expect(lastFindManyArgs().where).toMatchObject({
      environment: 'production',
      version: { contains: '3.2.0', mode: 'insensitive' },
    });
  });

  it('treats date_to as inclusive of the whole day', async () => {
    await service.getErrors({ dateFrom: '2026-05-12', dateTo: '2026-05-13' });

    expect(lastFindManyArgs().where.lastSeenAt).toEqual({
      gte: new Date('2026-05-12T00:00:00.000Z'),
      lt: new Date('2026-05-14T00:00:00.000Z'),
    });
  });

  it('omits the date filter when no dates are provided', async () => {
    await service.getErrors({ message: 'oops' });

    expect(lastFindManyArgs().where.lastSeenAt).toBeUndefined();
  });

  it('paginates with skip/take and defaults to page size 20', async () => {
    await service.getErrors({ page: 2 });

    expect(lastFindManyArgs()).toMatchObject({ skip: 20, take: 20 });
  });

  it('uses the requested page size', async () => {
    await service.getErrors({ page: 3, pageSize: 10 });

    expect(lastFindManyArgs()).toMatchObject({ skip: 20, take: 10 });
  });

  it('returns the effective page size for the response envelope', async () => {
    const result = await service.getErrors({ pageSize: 50 });

    expect(result.pageSize).toBe(50);
  });
});

describe('AdminService delete operations', () => {
  let service: AdminService;
  let prisma: {
    replay: {
      findUnique: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    error: {
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
    errorEvent: {
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let storage: { deleteWithResult: jest.Mock };

  beforeEach(() => {
    prisma = {
      replay: {
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockReturnValue({ model: 'replay.deleteMany' }),
      },
      error: {
        findUnique: jest.fn(),
        delete: jest.fn().mockReturnValue({ model: 'error.delete' }),
      },
      errorEvent: {
        deleteMany: jest
          .fn()
          .mockReturnValue({ model: 'errorEvent.deleteMany' }),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    storage = {
      deleteWithResult: jest.fn().mockResolvedValue({
        status: 'deleted',
        storageKey: 'replays/demo/replay_1.json.gz',
      }),
    };
    service = new AdminService(
      prisma as unknown as PrismaService,
      storage as unknown as ReplayStorageService,
    );
  });

  it('deletes a single replay row and file without deleting the linked event', async () => {
    prisma.replay.findUnique.mockResolvedValue({
      id: 'replay_1',
      errorEventId: 'event_1',
      storageKey: 'replays/demo/replay_1.json.gz',
    });

    const result = await service.deleteReplay('replay_1');

    expect(prisma.replay.delete).toHaveBeenCalledWith({
      where: { id: 'replay_1' },
    });
    expect(prisma.errorEvent.deleteMany).not.toHaveBeenCalled();
    expect(prisma.error.delete).not.toHaveBeenCalled();
    expect(storage.deleteWithResult).toHaveBeenCalledWith(
      'replays/demo/replay_1.json.gz',
    );
    expect(result).toMatchObject({
      deleted: true,
      id: 'replay_1',
      cleanup: { status: 'complete' },
    });
  });

  it('throws when deleting a missing replay', async () => {
    prisma.replay.findUnique.mockResolvedValue(null);

    await expect(service.deleteReplay('missing')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.replay.delete).not.toHaveBeenCalled();
    expect(storage.deleteWithResult).not.toHaveBeenCalled();
  });

  it('deletes an error group with events, replay rows, and replay files', async () => {
    prisma.error.findUnique.mockResolvedValue({
      id: 'error_1',
      errorEvents: [
        {
          id: 'event_1',
          replay: {
            id: 'replay_1',
            storageKey: 'replays/demo/replay_1.json.gz',
          },
        },
        { id: 'event_2', replay: null },
      ],
    });

    const result = await service.deleteErrorGroup('error_1');

    expect(prisma.replay.deleteMany).toHaveBeenCalledWith({
      where: { errorEventId: { in: ['event_1', 'event_2'] } },
    });
    expect(prisma.errorEvent.deleteMany).toHaveBeenCalledWith({
      where: { errorId: 'error_1' },
    });
    expect(prisma.error.delete).toHaveBeenCalledWith({
      where: { id: 'error_1' },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      { model: 'replay.deleteMany' },
      { model: 'errorEvent.deleteMany' },
      { model: 'error.delete' },
    ]);
    expect(storage.deleteWithResult).toHaveBeenCalledWith(
      'replays/demo/replay_1.json.gz',
    );
    expect(result).toMatchObject({
      deleted: true,
      id: 'error_1',
      cleanup: { status: 'complete' },
    });
  });

  it('returns partial_failed when storage cleanup fails after db delete', async () => {
    prisma.replay.findUnique.mockResolvedValue({
      id: 'replay_1',
      errorEventId: 'event_1',
      storageKey: 'replays/demo/replay_1.json.gz',
    });
    storage.deleteWithResult.mockResolvedValue({
      status: 'failed',
      storageKey: 'replays/demo/replay_1.json.gz',
      message: 'EACCES',
    });

    const result = await service.deleteReplay('replay_1');

    expect(result.cleanup).toMatchObject({
      status: 'partial_failed',
      failed: [
        {
          replayId: 'replay_1',
          storageKey: 'replays/demo/replay_1.json.gz',
          message: 'EACCES',
        },
      ],
    });
  });

  it('returns complete_with_missing_files when storage file is already absent', async () => {
    prisma.replay.findUnique.mockResolvedValue({
      id: 'replay_1',
      errorEventId: 'event_1',
      storageKey: 'replays/demo/replay_1.json.gz',
    });
    storage.deleteWithResult.mockResolvedValue({
      status: 'missing',
      storageKey: 'replays/demo/replay_1.json.gz',
    });

    const result = await service.deleteReplay('replay_1');

    expect(result.cleanup.status).toBe('complete_with_missing_files');
  });
});
