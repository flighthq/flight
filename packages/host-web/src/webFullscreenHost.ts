import type { HostFullscreenCapabilities } from '@flighthq/app/contract';

import { webHostFullscreen } from './webWindow.ts';

export const webHostFullscreenGroup = {
  element: webHostFullscreen,
} satisfies HostFullscreenCapabilities;
