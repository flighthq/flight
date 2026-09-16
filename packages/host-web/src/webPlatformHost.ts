import type { HostPlatformCapabilities } from '@flighthq/types/contract';

import { webHostPlatform } from './webPlatform';

export const webHostPlatformGroup = {
  info: webHostPlatform,
} satisfies HostPlatformCapabilities;
