import type { HostSurfaceCapabilities } from '@flighthq/types/contract';

import { webHostSurfaceDisplay, webHostSurfaceResize } from './webHostSurface';

export const webHostSurfaceGroup = {
  display: webHostSurfaceDisplay,
  resize: webHostSurfaceResize,
} satisfies HostSurfaceCapabilities;
