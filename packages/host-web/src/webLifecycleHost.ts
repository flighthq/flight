import type { HostLifecycleCapabilities } from '@flighthq/types/contract';

import { webHostLifecycle } from './webLifecycle';

export const webHostLifecycleGroup = {
  state: webHostLifecycle,
} satisfies HostLifecycleCapabilities;
