import type { HostAccessibilityCapabilities } from '@flighthq/host/contract';

import { webHostAccessibility } from './webAccessibility.ts';

export const webHostAccessibilityGroup = {
  tree: webHostAccessibility,
} satisfies HostAccessibilityCapabilities;
