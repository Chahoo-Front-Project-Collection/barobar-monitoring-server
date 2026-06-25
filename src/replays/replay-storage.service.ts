import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export type ReplayStorageDeleteResult =
  | { status: 'deleted'; storageKey: string }
  | { status: 'missing'; storageKey: string }
  | { status: 'failed'; storageKey: string; message: string };

@Injectable()
export class ReplayStorageService {
  private readonly basePath: string;

  constructor() {
    this.basePath = process.env.STORAGE_PATH ?? './storage';
  }

  async save(
    tenantSlug: string,
    replayId: string,
    payload: object,
  ): Promise<{ storageKey: string; sizeBytes: number }> {
    const dir = path.join(this.basePath, 'replays', tenantSlug);
    await fs.mkdir(dir, { recursive: true });

    const fileName = `${replayId}.json.gz`;
    const filePath = path.join(dir, fileName);
    const storageKey = `replays/${tenantSlug}/${fileName}`;

    const json = JSON.stringify(payload);
    const compressed = await gzip(json);
    await fs.writeFile(filePath, compressed);

    return { storageKey, sizeBytes: compressed.byteLength };
  }

  async load(storageKey: string): Promise<object> {
    const filePath = path.join(this.basePath, storageKey);
    if (!existsSync(filePath)) {
      throw new InternalServerErrorException(
        `Replay file not found: ${storageKey}`,
      );
    }
    const compressed = await fs.readFile(filePath);
    const json = await gunzip(compressed);
    return JSON.parse(json.toString()) as object;
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = path.join(this.basePath, storageKey);
    await fs.unlink(filePath).catch(() => undefined);
  }

  async deleteWithResult(
    storageKey: string,
  ): Promise<ReplayStorageDeleteResult> {
    const filePath = path.join(this.basePath, storageKey);

    try {
      await fs.unlink(filePath);
      return { status: 'deleted', storageKey };
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return { status: 'missing', storageKey };
      }

      return {
        status: 'failed',
        storageKey,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
