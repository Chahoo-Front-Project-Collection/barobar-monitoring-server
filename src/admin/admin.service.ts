import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReplayStorageDeleteResult,
  ReplayStorageService,
} from '../replays/replay-storage.service';

export type DeleteCleanupStatus =
  | 'complete'
  | 'complete_with_missing_files'
  | 'partial_failed';

export interface DeleteCleanupSummary {
  status: DeleteCleanupStatus;
  deleted: ReplayStorageDeleteResult[];
  missing: ReplayStorageDeleteResult[];
  failed: ReplayStorageDeleteResult[];
}

export interface DeleteReplayResult {
  deleted: true;
  id: string;
  cleanup: DeleteCleanupSummary;
}

interface ReplayCleanupTarget {
  replayId: string;
  storageKey: string;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ReplayStorageService,
  ) {}

  async getErrors(query: {
    message?: string;
    environment?: string;
    version?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 20;
    const lastSeenAt = buildLastSeenRange(query.dateFrom, query.dateTo);

    const where = {
      ...(query.message && {
        message: { contains: query.message, mode: 'insensitive' as const },
      }),
      ...(query.environment && { environment: query.environment }),
      ...(query.version && {
        version: { contains: query.version, mode: 'insensitive' as const },
      }),
      ...(lastSeenAt && { lastSeenAt }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.error.findMany({
        where,
        include: { tenant: { select: { slug: true, name: true } } },
        orderBy: { lastSeenAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.error.count({ where }),
    ]);
    return { items, total, pageSize };
  }

  async getError(id: string) {
    const error = await this.prisma.error.findUnique({
      where: { id },
      include: {
        tenant: { select: { slug: true, name: true } },
        errorEvents: {
          orderBy: { occurredAt: 'desc' },
          take: 20,
          include: { replay: { select: { id: true } } },
        },
      },
    });
    if (!error) throw new NotFoundException('Error not found');
    return error;
  }

  async getReplays(query: { tenantSlug?: string }) {
    const where = {
      ...(query.tenantSlug && { tenant: { slug: query.tenantSlug } }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.replay.findMany({
        where,
        include: {
          tenant: { select: { slug: true } },
          errorEvent: {
            select: { pageUrl: true, occurredAt: true, message: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.replay.count({ where }),
    ]);
    return { items, total };
  }

  async getReplay(id: string) {
    const replay = await this.prisma.replay.findUnique({
      where: { id },
      include: { errorEvent: true },
    });
    if (!replay) throw new NotFoundException('Replay not found');

    const payload = await this.storage.load(replay.storageKey);
    return { ...replay, payload };
  }

  async deleteReplay(id: string): Promise<DeleteReplayResult> {
    const replay = await this.prisma.replay.findUnique({
      where: { id },
      select: { id: true, storageKey: true, errorEventId: true },
    });
    if (!replay) throw new NotFoundException('Replay not found');

    await this.prisma.replay.delete({ where: { id } });
    const cleanup = await this.cleanupReplayFiles([
      { replayId: replay.id, storageKey: replay.storageKey },
    ]);

    this.logger.log(
      `Admin replay delete result: ${JSON.stringify({
        id,
        errorEventId: replay.errorEventId,
        cleanup,
      })}`,
    );

    return { deleted: true, id, cleanup };
  }

  async deleteErrorGroup(id: string): Promise<DeleteReplayResult> {
    const error = await this.prisma.error.findUnique({
      where: { id },
      include: {
        errorEvents: {
          select: {
            id: true,
            replay: { select: { id: true, storageKey: true } },
          },
        },
      },
    });
    if (!error) throw new NotFoundException('Error not found');

    const eventIds = error.errorEvents.map((event) => event.id);
    const replayTargets = error.errorEvents.flatMap((event) =>
      event.replay
        ? [{ replayId: event.replay.id, storageKey: event.replay.storageKey }]
        : [],
    );

    await this.prisma.$transaction([
      this.prisma.replay.deleteMany({
        where: { errorEventId: { in: eventIds } },
      }),
      this.prisma.errorEvent.deleteMany({ where: { errorId: id } }),
      this.prisma.error.delete({ where: { id } }),
    ]);
    const cleanup = await this.cleanupReplayFiles(replayTargets);

    this.logger.log(
      `Admin error group delete result: ${JSON.stringify({
        id,
        eventCount: eventIds.length,
        replayCount: replayTargets.length,
        cleanup,
      })}`,
    );

    return { deleted: true, id, cleanup };
  }

  private async cleanupReplayFiles(
    targets: ReplayCleanupTarget[],
  ): Promise<DeleteCleanupSummary> {
    const results = await Promise.all(
      targets.map(async (target) => ({
        replayId: target.replayId,
        ...(await this.storage.deleteWithResult(target.storageKey)),
      })),
    );

    const deleted = results.filter((result) => result.status === 'deleted');
    const missing = results.filter((result) => result.status === 'missing');
    const failed = results.filter((result) => result.status === 'failed');

    if (failed.length > 0) {
      this.logger.error(
        `Replay storage cleanup failed: ${JSON.stringify(failed)}`,
      );
    }

    return {
      status:
        failed.length > 0
          ? 'partial_failed'
          : missing.length > 0
            ? 'complete_with_missing_files'
            : 'complete',
      deleted,
      missing,
      failed,
    };
  }
}

// Builds a lastSeenAt range filter. `dateTo` is inclusive of the whole day,
// so we match everything before the start of the following day.
function buildLastSeenRange(dateFrom?: string, dateTo?: string) {
  const range: { gte?: Date; lt?: Date } = {};

  if (dateFrom) {
    const from = new Date(dateFrom);
    if (!Number.isNaN(from.getTime())) {
      range.gte = from;
    }
  }

  if (dateTo) {
    const to = new Date(dateTo);
    if (!Number.isNaN(to.getTime())) {
      to.setUTCDate(to.getUTCDate() + 1);
      range.lt = to;
    }
  }

  return range.gte || range.lt ? range : undefined;
}
