import type { HostCanvasCapabilities } from '@flighthq/types/contract';

import { webHostCanvas } from './webHostCanvas';

export const webHostCanvasGroup = {
  context: webHostCanvas,
} satisfies HostCanvasCapabilities;
