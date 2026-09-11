import type { HostUiCapabilities } from '@flighthq/types/contract';

import { webHostStatusBarColor } from './webStatusbar';
import { webHostFullscreen } from './webWindow';

export const webHostUi = {
  fullscreen: webHostFullscreen,
  statusBarColor: webHostStatusBarColor,
} satisfies HostUiCapabilities;
