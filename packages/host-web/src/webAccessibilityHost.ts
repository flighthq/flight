import type { HostAccessibilityCapabilities } from '@flighthq/types/contract';

import { webHostAccessibility } from './webAccessibility.ts';

export const webHostAccessibilityGroup = {
  tree: webHostAccessibility,
} satisfies HostAccessibilityCapabilities;
