import type { HostCanvasCapabilities } from '@flighthq/surface/contract';

import { webHostCanvas } from './webHostCanvas.ts';

export const webHostCanvasGroup = {
  context: webHostCanvas,
} satisfies HostCanvasCapabilities;
