import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminController } from './admin.controller';
import { AdminSessionGuard } from './admin-session.guard';

describe('AdminController auth metadata', () => {
  it.each(['getErrors', 'getError', 'getReplays', 'getReplay'])(
    'protects %s with AdminSessionGuard',
    (methodName) => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        AdminController.prototype[methodName],
      );

      expect(guards).toContain(AdminSessionGuard);
    },
  );
});
