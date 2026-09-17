import type { HostGlCapabilities } from '@flighthq/types/contract';

import { webHostGl } from './webHostTarget';

export const webHostGlGroup = {
  context: webHostGl,
} satisfies HostGlCapabilities;
