import { Controller, Get, Param, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ok, paginated } from '../common/api-response';

@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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

  @Get('errors/:id')
  async getError(@Param('id') id: string) {
    const data = await this.adminService.getError(id);
    return ok(data);
  }

  @Get('replays')
  async getReplays(@Query('tenant') tenantSlug?: string) {
    const { items, total } = await this.adminService.getReplays({ tenantSlug });
    return paginated(items, total, 100);
  }

  @Get('replays/:id')
  async getReplay(@Param('id') id: string) {
    const data = await this.adminService.getReplay(id);
    return ok(data);
  }
}
