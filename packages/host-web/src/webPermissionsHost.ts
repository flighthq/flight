import type { HostPermissionsCapabilities } from '@flighthq/host/contract';

import { webHostPermissions } from './webPermissions.ts';

export const webHostPermissionsGroup = {
  query: webHostPermissions,
} satisfies HostPermissionsCapabilities;
