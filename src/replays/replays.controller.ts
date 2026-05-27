import { Controller, Post, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ReplaysService } from './replays.service';
import { CreateReplayDto } from './replays.dto';

@Controller('api/replays')
export class ReplaysController {
  constructor(private readonly replaysService: ReplaysService) {}

  @Post()
  create(@Body() dto: CreateReplayDto, @Req() req: Request) {
    const origin = req.headers['origin'] as string | undefined;
    return this.replaysService.create(dto, origin);
  }
}
