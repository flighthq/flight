import type { HostAccessibilityCapabilities } from '@flighthq/types/contract';

import { webHostAccessibility } from './webAccessibility';

export const webHostAccessibilityGroup = {
  provider: webHostAccessibility,
} satisfies HostAccessibilityCapabilities;
