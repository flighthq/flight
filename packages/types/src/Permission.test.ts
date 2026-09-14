import { describe, expectTypeOf, it } from 'vitest';

import type {
  Entity,
  HostNotificationPermissionProvider,
  HostPermissionsProvider,
  PermissionName,
  PermissionQueryOutcome,
  PermissionRequestOutcome,
} from './index';

describe('HostPermissionsProvider', () => {
  it('is an Entity with only the native permission operations and Notification provider', () => {
    expectTypeOf<HostPermissionsProvider>().toExtend<Entity>();
    expectTypeOf<HostPermissionsProvider['notification']>().toEqualTypeOf<HostNotificationPermissionProvider>();
    expectTypeOf<HostPermissionsProvider['queryPermission']>().parameters.toEqualTypeOf<[PermissionName]>();
    expectTypeOf<HostPermissionsProvider['queryPermission']>().returns.toEqualTypeOf<Promise<PermissionQueryOutcome>>();
    expectTypeOf<HostPermissionsProvider['requestMediaAccess']>().parameters.toEqualTypeOf<['camera' | 'microphone']>();
    expectTypeOf<HostPermissionsProvider['requestMediaAccess']>().returns.toEqualTypeOf<
      Promise<PermissionRequestOutcome>
    >();
    expectTypeOf<HostPermissionsProvider['requestWakeLock']>().parameters.toEqualTypeOf<[]>();
    expectTypeOf<HostPermissionsProvider['requestWakeLock']>().returns.toEqualTypeOf<
      Promise<PermissionRequestOutcome>
    >();
  });
});
