import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthService, AdminSession } from './admin-auth.service';

export type AdminRequest = Request & {
  adminUser?: AdminSession;
};

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly adminAuth: AdminAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    request.adminUser = this.adminAuth.verifyCookieHeader(
      request.headers.cookie,
    );
    return true;
  }
}
