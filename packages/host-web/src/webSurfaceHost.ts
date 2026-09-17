import type { HostSurfaceCapabilities } from '@flighthq/types/contract';

import { webHostSurface } from './webHostTarget';
import { webSurfaceCreateCapability } from './webSurfaceCreate';

export const webHostSurfaceGroup = {
  create: webSurfaceCreateCapability,
  resize: webHostSurface,
} satisfies HostSurfaceCapabilities;
