import type { HostGlCapabilities } from '@flighthq/types/contract';

import { webHostGl } from './webHostGl';

export const webHostGlGroup = {
  context: webHostGl,
} satisfies HostGlCapabilities;
