import type { PermissionName, PermissionQueryOutcome, PermissionRequestOutcome } from '@flighthq/permissions/contract';

import type { HostNotificationPermissionCapability } from './Notification.ts';

/** @deprecated Import permission contracts from `@flighthq/permissions/contract`. */
export type {
  PermissionName,
  PermissionState,
  PermissionQueryFailureReason,
  PermissionQueryOutcome,
  PermissionRequestFailureReason,
  PermissionRequestOutcome,
} from '@flighthq/permissions/contract';

export interface HostPermissionsCapability {
  readonly notification: HostNotificationPermissionCapability;
  queryPermission(name: PermissionName): Promise<PermissionQueryOutcome>;
  requestMediaAccess(name: 'camera' | 'microphone'): Promise<PermissionRequestOutcome>;
  requestWakeLock(): Promise<PermissionRequestOutcome>;
}
