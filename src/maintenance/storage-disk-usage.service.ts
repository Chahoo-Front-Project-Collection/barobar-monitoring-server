import { Injectable } from '@nestjs/common';
import { statfs } from 'fs/promises';

export interface DiskUsageSnapshot {
  usedPercent: number;
  totalBytes: number;
  availableBytes: number;
}

@Injectable()
export class StorageDiskUsageService {
  async getUsage(path: string): Promise<DiskUsageSnapshot> {
    const stats = await statfs(path);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const availableBytes = Number(stats.bavail) * Number(stats.bsize);
    const usedPercent =
      totalBytes > 0 ? ((totalBytes - availableBytes) / totalBytes) * 100 : 0;

    return {
      usedPercent,
      totalBytes,
      availableBytes,
    };
  }
}
