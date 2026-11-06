import type { HostHapticsCapabilities } from '@flighthq/haptics/contract';

import { webHostHaptics } from './webHaptics.ts';

export const webHostHapticsGroup = {
  engine: webHostHaptics,
} satisfies HostHapticsCapabilities;
