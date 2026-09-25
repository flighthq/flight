import type { HostCanvasCapabilities } from '@flighthq/types/contract';

import { webHostCanvas } from './webHostCanvas.ts';

export const webHostCanvasGroup = {
  context: webHostCanvas,
} satisfies HostCanvasCapabilities;
