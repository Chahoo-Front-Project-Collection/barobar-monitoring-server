import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReplayStorageService } from '../replays/replay-storage.service';
import { LoadTestCleanupService } from './load-test-cleanup.service';
import { ReplayCleanupService } from './replay-cleanup.service';
import { StorageDiskUsageService } from './storage-disk-usage.service';

@Module({
  imports: [PrismaModule],
  providers: [
    LoadTestCleanupService,
    ReplayCleanupService,
    ReplayStorageService,
    StorageDiskUsageService,
  ],
})
export class MaintenanceModule {}
