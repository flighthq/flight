import type { HostLifecycleCapabilities } from '@flighthq/types/contract';

import { webHostLifecycle } from './webLifecycle.ts';

export const webHostLifecycleGroup = {
  state: webHostLifecycle,
} satisfies HostLifecycleCapabilities;
