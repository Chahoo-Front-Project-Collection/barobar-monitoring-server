import { Test, TestingModule } from '@nestjs/testing';
import { AppController, type HealthResponse } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should return an alive status without checking dependencies', () => {
      const response: HealthResponse = appController.getHealth();

      expect(response).toEqual({ status: 'ok' });
    });
  });
});
