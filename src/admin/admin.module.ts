import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ReplayStorageService } from '../replays/replay-storage.service';

@Module({
  controllers: [AdminController],
  providers: [AdminService, ReplayStorageService],
})
export class AdminModule {}
