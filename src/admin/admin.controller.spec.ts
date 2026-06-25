import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminController } from './admin.controller';
import { AdminSessionGuard } from './admin-session.guard';

describe('AdminController auth metadata', () => {
  const guardedMethods = [
    'getErrors',
    'getError',
    'deleteError',
    'getReplays',
    'getReplay',
    'deleteReplay',
  ] as const satisfies readonly (keyof AdminController)[];

  it.each(guardedMethods)(
    'protects %s with AdminSessionGuard',
    (methodName) => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        AdminController.prototype[methodName],
      ) as unknown[];

      expect(guards).toContain(AdminSessionGuard);
    },
  );
});
