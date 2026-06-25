import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminService } from './admin.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './admin-auth.dto';
import { AdminSessionGuard } from './admin-session.guard';
import type { AdminRequest } from './admin-session.guard';
import { ok, paginated } from '../common/api-response';

@Controller('api/admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminAuth: AdminAuthService,
  ) {}

  @Post('login')
  login(
    @Body() dto: AdminLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = this.adminAuth.login(dto.username, dto.password);
    response.cookie(
      this.adminAuth.cookieName,
      session.cookieValue,
      this.adminAuth.cookieOptions(session.expiresAt),
    );
    return ok({ username: session.username });
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(
      this.adminAuth.cookieName,
      this.adminAuth.clearCookieOptions(),
    );
    return ok({ success: true });
  }

  @UseGuards(AdminSessionGuard)
  @Get('me')
  me(@Req() request: AdminRequest) {
    return ok({ username: request.adminUser?.username });
  }

  @UseGuards(AdminSessionGuard)
  @Get('errors')
  async getErrors(
    @Query('message') message?: string,
    @Query('environment') environment?: string,
    @Query('version') version?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ) {
    const {
      items,
      total,
      pageSize: limit,
    } = await this.adminService.getErrors({
      message,
      environment,
      version,
      dateFrom,
      dateTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    return paginated(items, total, limit);
  }

  @UseGuards(AdminSessionGuard)
  @Get('errors/:id')
  async getError(@Param('id') id: string) {
    const data = await this.adminService.getError(id);
    return ok(data);
  }

  @UseGuards(AdminSessionGuard)
  @Delete('errors/:id')
  async deleteError(@Param('id') id: string) {
    const data = await this.adminService.deleteErrorGroup(id);
    return ok(
      data,
      data.cleanup.status === 'partial_failed'
        ? 'Deleted with storage cleanup failures'
        : 'OK',
    );
  }

  @UseGuards(AdminSessionGuard)
  @Get('replays')
  async getReplays(@Query('tenant') tenantSlug?: string) {
    const { items, total } = await this.adminService.getReplays({ tenantSlug });
    return paginated(items, total, 100);
  }

  @UseGuards(AdminSessionGuard)
  @Get('replays/:id')
  async getReplay(@Param('id') id: string) {
    const data = await this.adminService.getReplay(id);
    return ok(data);
  }

  @UseGuards(AdminSessionGuard)
  @Delete('replays/:id')
  async deleteReplay(@Param('id') id: string) {
    const data = await this.adminService.deleteReplay(id);
    return ok(
      data,
      data.cleanup.status === 'partial_failed'
        ? 'Deleted with storage cleanup failures'
        : 'OK',
    );
  }
}
