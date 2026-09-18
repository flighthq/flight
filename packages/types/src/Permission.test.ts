import { describe, expectTypeOf, it } from 'vitest';

import type {
  HostNotificationPermissionCapability,
  HostPermissionsCapability,
  PermissionName,
  PermissionQueryOutcome,
  PermissionRequestOutcome,
} from './index';

describe('HostPermissionsCapability', () => {
  it('has the native permission operations and Notification provider', () => {
    expectTypeOf<HostPermissionsCapability['notification']>().toEqualTypeOf<HostNotificationPermissionCapability>();
    expectTypeOf<HostPermissionsCapability['queryPermission']>().parameters.toEqualTypeOf<[PermissionName]>();
    expectTypeOf<HostPermissionsCapability['queryPermission']>().returns.toEqualTypeOf<
      Promise<PermissionQueryOutcome>
    >();
    expectTypeOf<HostPermissionsCapability['requestMediaAccess']>().parameters.toEqualTypeOf<
      ['camera' | 'microphone']
    >();
    expectTypeOf<HostPermissionsCapability['requestMediaAccess']>().returns.toEqualTypeOf<
      Promise<PermissionRequestOutcome>
    >();
    expectTypeOf<HostPermissionsCapability['requestWakeLock']>().parameters.toEqualTypeOf<[]>();
    expectTypeOf<HostPermissionsCapability['requestWakeLock']>().returns.toEqualTypeOf<
      Promise<PermissionRequestOutcome>
    >();
  });
});
