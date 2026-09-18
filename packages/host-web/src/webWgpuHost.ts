import type { HostWgpuCapabilities } from '@flighthq/types/contract';

import { webHostWgpuContext } from './webHostWgpuContext';

export const webHostWgpu = {
  context: webHostWgpuContext,
} satisfies HostWgpuCapabilities;
