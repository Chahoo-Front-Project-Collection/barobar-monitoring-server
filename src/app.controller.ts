import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

export type HealthResponse = {
  status: 'ok';
};

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }
}
