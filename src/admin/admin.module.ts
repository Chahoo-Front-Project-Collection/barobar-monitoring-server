import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminSessionGuard } from './admin-session.guard';
import { ReplayStorageService } from '../replays/replay-storage.service';

@Module({
  controllers: [AdminController],
  providers: [AdminService, AdminAuthService, AdminSessionGuard, ReplayStorageService],
})
export class AdminModule {}
