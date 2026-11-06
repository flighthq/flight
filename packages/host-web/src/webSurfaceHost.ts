import type { HostSurfaceCapabilities } from '@flighthq/surface/contract';

import { webHostSurfaceDisplay, webHostSurfaceResize } from './webHostSurface.ts';

export const webHostSurfaceGroup = {
  display: webHostSurfaceDisplay,
  resize: webHostSurfaceResize,
} satisfies HostSurfaceCapabilities;
