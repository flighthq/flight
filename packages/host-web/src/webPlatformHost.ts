import type { HostPlatformCapabilities } from '@flighthq/platform/contract';

import { webHostPlatform } from './webPlatform.ts';

export const webHostPlatformGroup = {
  info: webHostPlatform,
} satisfies HostPlatformCapabilities;
