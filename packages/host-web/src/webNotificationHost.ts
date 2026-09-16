import type { HostNotificationCapabilities } from '@flighthq/types/contract';

import { webHostNotificationPermission } from './webPermissions';

export const webHostNotification = {
  permission: webHostNotificationPermission,
} satisfies HostNotificationCapabilities;
