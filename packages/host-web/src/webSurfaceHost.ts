import type { HostSurfaceCapabilities } from '@flighthq/types/contract';

import { webHostSurface } from './webInputTarget';
import { webSurfaceCreateCapability } from './webSurfaceCreate';

export const webHostSurfaceGroup = {
  create: webSurfaceCreateCapability,
  resize: webHostSurface,
} satisfies HostSurfaceCapabilities;
