import { createHost } from '@flighthq/entity/contract';
import type { HostAccessibilityCapabilities } from '@flighthq/types/contract';

import { webHostAccessibility } from './webAccessibility';

export const webHostAccessibilityGroup = {
  provider: webHostAccessibility,
} satisfies HostAccessibilityCapabilities;

export const webAccessibilityHost = /* @__PURE__ */ createHost({ accessibility: webHostAccessibilityGroup });
