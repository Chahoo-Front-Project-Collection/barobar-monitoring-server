import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MaintenanceModule } from './maintenance.module';
import { LoadTestCleanupService } from './load-test-cleanup.service';

const DEFAULT_TEST_VERSION = '3.7.0';

async function main() {
  const app = await NestFactory.createApplicationContext(MaintenanceModule);
  try {
    const cleanup = app.get(LoadTestCleanupService);
    const version = readArgValue('--version') ?? DEFAULT_TEST_VERSION;
    const result = await cleanup.run({
      version,
      dryRun: !process.argv.includes('--confirm'),
    });
    console.log(JSON.stringify(result));
  } finally {
    await app.close();
  }
}

function readArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
