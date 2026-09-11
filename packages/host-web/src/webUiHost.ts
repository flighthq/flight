import { createHost } from '@flighthq/entity/contract';
import type { HostUiCapabilities } from '@flighthq/types/contract';

import { webHostStatusBarColor } from './webStatusbar';
import { webHostFullscreen } from './webWindow';

export const webHostUi = {
  fullscreen: webHostFullscreen,
  statusBarColor: webHostStatusBarColor,
} satisfies HostUiCapabilities;

export const webUiHost = /* @__PURE__ */ createHost({ ui: webHostUi });
