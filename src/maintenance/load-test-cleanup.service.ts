import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReplayStorageService } from '../replays/replay-storage.service';

interface LoadTestCleanupOptions {
  version: string;
  dryRun?: boolean;
}

interface LoadTestCleanupTarget {
  id: string;
  errorId: string;
  replay: {
    id: string;
    storageKey: string;
  } | null;
}

export interface LoadTestCleanupResult {
  version: string;
  dryRun: boolean;
  errorEventCount: number;
  replayCount: number;
  deletedErrorEventCount: number;
  deletedReplayCount: number;
  deletedErrorCount: number;
  deletedFileCount: number;
  failedFileCount: number;
}

@Injectable()
export class LoadTestCleanupService {
  private readonly logger = new Logger(LoadTestCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ReplayStorageService,
  ) {}

  async run(options: LoadTestCleanupOptions): Promise<LoadTestCleanupResult> {
    const version = options.version.trim();
    if (!version) {
      throw new Error('version is required');
    }

    const dryRun = options.dryRun ?? true;
    const targets = await this.findTargets(version);
    const replayTargets = targets.flatMap((target) =>
      target.replay ? [target.replay] : [],
    );
    const errorIds = [...new Set(targets.map((target) => target.errorId))];

    const result: LoadTestCleanupResult = {
      version,
      dryRun,
      errorEventCount: targets.length,
      replayCount: replayTargets.length,
      deletedErrorEventCount: 0,
      deletedReplayCount: 0,
      deletedErrorCount: 0,
      deletedFileCount: 0,
      failedFileCount: 0,
    };

    if (dryRun || targets.length === 0) {
      this.logger.log(
        `Load test cleanup dry-run result: ${JSON.stringify(result)}`,
      );
      return result;
    }

    await this.prisma.$transaction(async (tx) => {
      const deletedReplays = await tx.replay.deleteMany({
        where: { id: { in: replayTargets.map((replay) => replay.id) } },
      });
      const deletedEvents = await tx.errorEvent.deleteMany({
        where: { id: { in: targets.map((target) => target.id) } },
      });
      const deletedErrors = await tx.error.deleteMany({
        where: {
          id: { in: errorIds },
          errorEvents: { none: {} },
        },
      });

      result.deletedReplayCount = deletedReplays.count;
      result.deletedErrorEventCount = deletedEvents.count;
      result.deletedErrorCount = deletedErrors.count;
    });

    for (const replay of replayTargets) {
      try {
        await this.storage.delete(replay.storageKey);
        result.deletedFileCount += 1;
      } catch {
        result.failedFileCount += 1;
      }
    }

    this.logger.log(`Load test cleanup result: ${JSON.stringify(result)}`);
    return result;
  }

  private findTargets(version: string): Promise<LoadTestCleanupTarget[]> {
    return this.prisma.errorEvent.findMany({
      where: { version },
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
  }
}
