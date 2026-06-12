import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReplayStorageService } from '../replays/replay-storage.service';
import {
  DiskUsageSnapshot,
  StorageDiskUsageService,
} from './storage-disk-usage.service';

const REPLAY_CLEANUP_START_USAGE_PERCENT = 80;
const REPLAY_CLEANUP_STOP_USAGE_PERCENT = 70;

interface ReplayCleanupOptions {
  batchSize?: number;
  dryRun?: boolean;
}

interface ReplayCleanupConfig {
  storagePath: string;
  cleanupStartPercent: number;
  cleanupStopPercent: number;
}

interface ReplayCleanupCandidate {
  id: string;
  errorEventId: string;
  storageKey: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface ReplayCleanupResult {
  dryRun: boolean;
  cleanupStarted: boolean;
  initialUsedPercent: number;
  finalUsedPercent: number;
  candidateReplayCount: number;
  deletedReplayCount: number;
  deletedErrorEventCount: number;
  deletedFileCount: number;
  deletedBytes: number;
  estimatedBytes: number;
}

@Injectable()
export class ReplayCleanupService {
  private readonly logger = new Logger(ReplayCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ReplayStorageService,
    private readonly diskUsage: StorageDiskUsageService,
  ) {}

  async run(options: ReplayCleanupOptions = {}): Promise<ReplayCleanupResult> {
    const config = readConfig();
    const batchSize = options.batchSize ?? 100;
    const dryRun = options.dryRun ?? false;
    const initialUsage = await this.diskUsage.getUsage(config.storagePath);
    const result = createResult(dryRun, initialUsage);

    if (initialUsage.usedPercent < config.cleanupStartPercent) {
      this.logger.log(
        `Replay cleanup skipped: disk usage ${formatPercent(initialUsage.usedPercent)} is below ${config.cleanupStartPercent}%`,
      );
      return result;
    }

    result.cleanupStarted = true;
    let currentUsage = initialUsage;

    while (currentUsage.usedPercent > config.cleanupStopPercent) {
      const candidates = await this.findCandidates(batchSize);
      result.candidateReplayCount += candidates.length;

      if (candidates.length === 0) break;

      for (const candidate of candidates) {
        result.estimatedBytes += candidate.sizeBytes;
        if (dryRun) continue;

        await this.deleteCandidate(candidate);
        result.deletedReplayCount += 1;
        result.deletedErrorEventCount += 1;
        result.deletedFileCount += 1;
        result.deletedBytes += candidate.sizeBytes;
      }

      if (dryRun) break;
      currentUsage = await this.diskUsage.getUsage(config.storagePath);
      result.finalUsedPercent = currentUsage.usedPercent;
    }

    this.logger.log(`Replay cleanup result: ${JSON.stringify(result)}`);
    return result;
  }

  private findCandidates(batchSize: number): Promise<ReplayCleanupCandidate[]> {
    return this.prisma.replay.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        errorEventId: true,
        storageKey: true,
        sizeBytes: true,
        createdAt: true,
      },
      take: batchSize,
    });
  }

  private async deleteCandidate(candidate: ReplayCleanupCandidate) {
    await this.prisma.$transaction([
      this.prisma.replay.delete({ where: { id: candidate.id } }),
      this.prisma.errorEvent.delete({ where: { id: candidate.errorEventId } }),
    ]);
    await this.storage.delete(candidate.storageKey);
  }
}

function createResult(
  dryRun: boolean,
  usage: DiskUsageSnapshot,
): ReplayCleanupResult {
  return {
    dryRun,
    cleanupStarted: false,
    initialUsedPercent: usage.usedPercent,
    finalUsedPercent: usage.usedPercent,
    candidateReplayCount: 0,
    deletedReplayCount: 0,
    deletedErrorEventCount: 0,
    deletedFileCount: 0,
    deletedBytes: 0,
    estimatedBytes: 0,
  };
}

function readConfig(): ReplayCleanupConfig {
  return {
    storagePath: './storage',
    cleanupStartPercent: REPLAY_CLEANUP_START_USAGE_PERCENT,
    cleanupStopPercent: REPLAY_CLEANUP_STOP_USAGE_PERCENT,
  };
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}
