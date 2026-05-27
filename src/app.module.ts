import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ReplaysModule } from './replays/replays.module';

@Module({
  imports: [PrismaModule, ReplaysModule],
})
export class AppModule {}
