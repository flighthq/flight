import type { HostScreenCapabilities } from '@flighthq/types/contract';

import {
  webHostScreenChange,
  webHostScreenDetails,
  webHostScreenPermissionChange,
  webHostScreenQuery,
} from './webScreen';

export const webHostScreen = {
  change: webHostScreenChange,
  details: webHostScreenDetails,
  permissionChange: webHostScreenPermissionChange,
  query: webHostScreenQuery,
} satisfies HostScreenCapabilities;
