import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReplayStorageService } from '../replays/replay-storage.service';

describe('AdminService.getErrors', () => {
  let service: AdminService;
  let findMany: jest.Mock;
  let count: jest.Mock;

  beforeEach(() => {
    findMany = jest.fn().mockReturnValue([]);
    count = jest.fn().mockReturnValue(0);
    const prisma = {
      error: { findMany, count },
      $transaction: (ops: unknown[]) => Promise.resolve(ops),
    } as unknown as PrismaService;
    const storage = {} as ReplayStorageService;
    service = new AdminService(prisma, storage);
  });

  function lastFindManyArgs() {
    return findMany.mock.calls[0][0];
  }

  it('searches message with a case-insensitive substring match', async () => {
    await service.getErrors({ message: 'timeout' });

    expect(lastFindManyArgs().where).toMatchObject({
      message: { contains: 'timeout', mode: 'insensitive' },
    });
  });

  it('keeps environment and version as exact matches', async () => {
    await service.getErrors({ environment: 'production', version: '3.2.0' });

    expect(lastFindManyArgs().where).toMatchObject({
      environment: 'production',
      version: '3.2.0',
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
