import { Controller, Post, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ReplaysService } from './replays.service';
import { ReplayRateLimitService } from './replay-rate-limit.service';
import { CreateReplayDto } from './replays.dto';

@Controller('api/replays')
export class ReplaysController {
  constructor(
    private readonly replaysService: ReplaysService,
    private readonly rateLimit: ReplayRateLimitService,
  ) {}

  @Post()
  create(@Body() dto: CreateReplayDto, @Req() req: Request) {
    const origin = req.headers['origin'] as string | undefined;
    this.rateLimit.assertAllowed({
      tenantId: dto.tenant_id,
      publicKey: dto.public_key,
      ip: getClientIp(req),
    });
    return this.replaysService.create(dto, origin);
  }
}

function getClientIp(req: Request) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor[0]?.trim()) {
    return forwardedFor[0].split(',')[0].trim();
  }
  return req.ip || 'unknown';
}
