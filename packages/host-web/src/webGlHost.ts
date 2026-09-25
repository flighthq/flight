import type { HostGlCapabilities } from '@flighthq/types/contract';

import { webHostGl } from './webHostGl.ts';

export const webHostGlGroup = {
  context: webHostGl,
} satisfies HostGlCapabilities;
