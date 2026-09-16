import type { HostFullscreenCapabilities } from '@flighthq/types/contract';

import { webHostFullscreen } from './webWindow';

export const webHostFullscreenGroup = {
  exit: webHostFullscreen,
} satisfies HostFullscreenCapabilities;
