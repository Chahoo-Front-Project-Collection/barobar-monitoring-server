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
    tenantSlug?: string;
    environment?: string;
    version?: string;
  }) {
    const where = {
      ...(query.tenantSlug && { tenant: { slug: query.tenantSlug } }),
      ...(query.environment && { environment: query.environment }),
      ...(query.version && { version: query.version }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.error.findMany({
        where,
        include: { tenant: { select: { slug: true, name: true } } },
        orderBy: { lastSeenAt: 'desc' },
        take: 100,
      }),
      this.prisma.error.count({ where }),
    ]);
    return { items, total };
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
