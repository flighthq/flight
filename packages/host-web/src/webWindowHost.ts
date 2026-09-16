import type { HostWindowCapabilities } from '@flighthq/types/contract';

import {
  webHostWindowAppearance,
  webHostWindowAttach,
  webHostWindowFocus,
  webHostWindowFullscreen,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from './webWindow';

export const webHostWindow = {
  appearance: webHostWindowAppearance,
  attach: webHostWindowAttach,
  focus: webHostWindowFocus,
  fullscreen: webHostWindowFullscreen,
  geometry: webHostWindowGeometry,
  lifecycle: webHostWindowLifecycle,
} satisfies HostWindowCapabilities;
