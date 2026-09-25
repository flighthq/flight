import type { HostPlatformCapabilities } from '@flighthq/types/contract';

import { webHostPlatform } from './webPlatform.ts';

export const webHostPlatformGroup = {
  info: webHostPlatform,
} satisfies HostPlatformCapabilities;
