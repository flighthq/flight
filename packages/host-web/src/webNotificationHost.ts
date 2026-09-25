import type { HostNotificationCapabilities } from '@flighthq/types/contract';

import { webHostNotificationPermission } from './webPermissions.ts';

export const webHostNotification = {
  permission: webHostNotificationPermission,
} satisfies HostNotificationCapabilities;
