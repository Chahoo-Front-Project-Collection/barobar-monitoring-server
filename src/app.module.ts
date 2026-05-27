import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ReplaysModule } from './replays/replays.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [PrismaModule, ReplaysModule, AdminModule],
})
export class AppModule {}
