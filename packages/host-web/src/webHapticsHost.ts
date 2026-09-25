import type { HostHapticsCapabilities } from '@flighthq/types/contract';

import { webHostHaptics } from './webHaptics.ts';

export const webHostHapticsGroup = {
  engine: webHostHaptics,
} satisfies HostHapticsCapabilities;
