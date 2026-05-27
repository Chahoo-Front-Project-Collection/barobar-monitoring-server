import { Module } from '@nestjs/common';
import { ReplaysController } from './replays.controller';
import { ReplaysService } from './replays.service';
import { ReplayStorageService } from './replay-storage.service';
import { TenantGuardService } from '../tenant/tenant-guard.service';

@Module({
  controllers: [ReplaysController],
  providers: [ReplaysService, ReplayStorageService, TenantGuardService],
})
export class ReplaysModule {}
