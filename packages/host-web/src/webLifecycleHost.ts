import type { HostLifecycleCapabilities } from '@flighthq/lifecycle/contract';

import { webHostLifecycle } from './webLifecycle.ts';

export const webHostLifecycleGroup = {
  state: webHostLifecycle,
} satisfies HostLifecycleCapabilities;
