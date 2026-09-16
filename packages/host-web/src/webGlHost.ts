import type { HostGlCapabilities } from '@flighthq/types/contract';

import { webHostGl } from './webInputTarget';

export const webHostGlGroup = {
  context: webHostGl,
} satisfies HostGlCapabilities;
