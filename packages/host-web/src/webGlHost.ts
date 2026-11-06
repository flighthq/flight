import type { HostGlCapabilities } from '@flighthq/render-gl/contract';

import { webHostGl } from './webHostGl.ts';

export const webHostGlGroup = {
  context: webHostGl,
} satisfies HostGlCapabilities;
