import type { HostFullscreenCapabilities } from '@flighthq/types/contract';

import { webHostFullscreen } from './webWindow';

export const webHostFullscreenGroup = {
  element: webHostFullscreen,
} satisfies HostFullscreenCapabilities;
