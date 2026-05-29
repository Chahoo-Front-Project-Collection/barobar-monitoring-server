import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReplayStorageService } from '../replays/replay-storage.service';

@Injectable()
export class AdminService {
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
      ...(query.version && { version: query.version }),
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
