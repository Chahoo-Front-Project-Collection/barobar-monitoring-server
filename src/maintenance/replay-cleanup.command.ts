import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ReplayCleanupService } from './replay-cleanup.service';
import { MaintenanceModule } from './maintenance.module';

async function main() {
  const app = await NestFactory.createApplicationContext(MaintenanceModule);
  try {
    const cleanup = app.get(ReplayCleanupService);
    const result = await cleanup.run({
      dryRun: process.argv.includes('--dry-run'),
    });
    console.log(JSON.stringify(result));
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
