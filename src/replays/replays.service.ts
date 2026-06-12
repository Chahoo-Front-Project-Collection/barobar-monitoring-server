import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantGuardService } from '../tenant/tenant-guard.service';
import { ReplayStorageService } from './replay-storage.service';
import { CreateReplayDto } from './replays.dto';
import { buildFingerprint } from './fingerprint.util';

@Injectable()
export class ReplaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantGuard: TenantGuardService,
    private readonly storage: ReplayStorageService,
  ) {}

  async create(dto: CreateReplayDto, origin: string | undefined) {
    const tenant = await this.tenantGuard.validate(dto.public_key, origin);

    const replayId = `replay_${randomUUID()}`;
    const fingerprint = buildFingerprint({
      tenantId: tenant.id,
      errorName: dto.error.name,
      requestUrl: dto.error.request_url,
      statusCode: dto.error.status_code,
    });

    const replayPayload = {
      events: dto.replay.events,
      http_requests: dto.http_requests ?? [],
      client: dto.client ?? {},
      user: dto.user ?? {},
      company: dto.company ?? {},
    };

    let storageResult: { storageKey: string; sizeBytes: number };
    try {
      storageResult = await this.storage.save(
        tenant.slug,
        replayId,
        replayPayload,
      );
    } catch {
      throw new InternalServerErrorException('Failed to save replay file');
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const error = await tx.error.upsert({
          where: {
            tenantId_fingerprint: { tenantId: tenant.id, fingerprint },
          },
          update: {
            lastSeenAt: new Date(dto.occurred_at),
            occurrenceCount: { increment: 1 },
            version: dto.version,
            environment: dto.environment,
          },
          create: {
            tenantId: tenant.id,
            fingerprint,
            message: dto.error.message,
            stack: dto.error.stack,
            pageUrl: dto.page_url,
            requestUrl: dto.error.request_url,
            statusCode: dto.error.status_code,
            version: dto.version,
            environment: dto.environment,
            firstSeenAt: new Date(dto.occurred_at),
            lastSeenAt: new Date(dto.occurred_at),
          },
        });

        const errorEvent = await tx.errorEvent.create({
          data: {
            errorId: error.id,
            tenantId: tenant.id,
            sessionId: dto.session_id,
            userId: dto.user?.user_id,
            userName: dto.user?.user_name,
            companyId: dto.company?.company_id,
            companyName: dto.company?.company_name,
            message: dto.error.message,
            stack: dto.error.stack,
            pageUrl: dto.page_url,
            requestUrl: dto.error.request_url,
            statusCode: dto.error.status_code,
            version: dto.version,
            environment: dto.environment,
            browserName: dto.client?.browser?.name,
            browserVersion: dto.client?.browser?.version,
            osName: dto.client?.os?.name,
            osVersion: dto.client?.os?.version,
            deviceType: dto.client?.device?.type,
            userAgent: dto.client?.browser?.user_agent,
            occurredAt: new Date(dto.occurred_at),
          },
        });

        const replay = await tx.replay.create({
          data: {
            id: replayId,
            tenantId: tenant.id,
            errorEventId: errorEvent.id,
            storageKey: storageResult.storageKey,
            sizeBytes: storageResult.sizeBytes,
            durationMs: dto.replay.duration_ms,
          },
        });

        return { error, errorEvent, replay };
      });

      return {
        replay_id: result.replay.id,
        error_event_id: result.errorEvent.id,
        error_id: result.error.id,
      };
    } catch {
      await this.storage.delete(storageResult.storageKey);
      throw new InternalServerErrorException('Failed to save to database');
    }
  }
}
