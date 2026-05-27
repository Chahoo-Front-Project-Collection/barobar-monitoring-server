import { Controller, Get, Param, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ok, paginated } from '../common/api-response';

@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('errors')
  async getErrors(
    @Query('tenant') tenantSlug?: string,
    @Query('environment') environment?: string,
    @Query('release') release?: string,
  ) {
    const { items, total } = await this.adminService.getErrors({
      tenantSlug,
      environment,
      release,
    });
    return paginated(items, total, 100);
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
