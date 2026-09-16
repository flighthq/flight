import type { HostPermissionsCapabilities } from '@flighthq/types/contract';

import { webHostPermissions } from './webPermissions';

export const webHostPermissionsGroup = {
  query: webHostPermissions,
} satisfies HostPermissionsCapabilities;
