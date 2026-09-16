import type { HostSurfaceCapabilities } from '@flighthq/types/contract';

import { webHostSurface } from './webInputTarget';

export const webHostSurfaceGroup = {
  resize: webHostSurface,
} satisfies HostSurfaceCapabilities;
