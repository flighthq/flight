import type { HostNotificationCapabilities } from '@flighthq/host/contract';

import { webHostNotificationPermission } from './webPermissions.ts';

export const webHostNotification = {
  permission: webHostNotificationPermission,
} satisfies HostNotificationCapabilities;
