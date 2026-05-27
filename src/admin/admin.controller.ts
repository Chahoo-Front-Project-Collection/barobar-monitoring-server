import { Controller, Get, Param, Query } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('errors')
  getErrors(
    @Query('tenant') tenantSlug?: string,
    @Query('environment') environment?: string,
    @Query('release') release?: string,
  ) {
    return this.adminService.getErrors({ tenantSlug, environment, release });
  }

  @Get('errors/:id')
  getError(@Param('id') id: string) {
    return this.adminService.getError(id);
  }

  @Get('replays')
  getReplays(@Query('tenant') tenantSlug?: string) {
    return this.adminService.getReplays({ tenantSlug });
  }

  @Get('replays/:id')
  getReplay(@Param('id') id: string) {
    return this.adminService.getReplay(id);
  }
}
