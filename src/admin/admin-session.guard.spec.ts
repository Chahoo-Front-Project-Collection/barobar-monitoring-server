import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminSessionGuard } from './admin-session.guard';

describe('AdminSessionGuard', () => {
  function createContext(request: Record<string, unknown>) {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  }

  it('attaches the verified admin user to the request', () => {
    const auth = {
      verifyCookieHeader: jest.fn().mockReturnValue({ username: 'admin' }),
    } as unknown as AdminAuthService;
    const guard = new AdminSessionGuard(auth);
    const request = { headers: { cookie: 'barobar_admin_session=value' } };

    expect(guard.canActivate(createContext(request))).toBe(true);
    expect(auth.verifyCookieHeader).toHaveBeenCalledWith(
      'barobar_admin_session=value',
    );
    expect(request).toMatchObject({ adminUser: { username: 'admin' } });
  });

  it('rejects requests without a valid admin session', () => {
    const auth = {
      verifyCookieHeader: jest.fn(() => {
        throw new UnauthorizedException('Admin login required');
      }),
    } as unknown as AdminAuthService;
    const guard = new AdminSessionGuard(auth);

    expect(() => guard.canActivate(createContext({ headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });
});
