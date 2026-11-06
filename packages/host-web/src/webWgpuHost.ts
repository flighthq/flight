import type { HostWgpuCapabilities } from '@flighthq/render-wgpu/contract';

import { webHostWgpuContext } from './webHostWgpuContext.ts';

export const webHostWgpu = {
  context: webHostWgpuContext,
} satisfies HostWgpuCapabilities;
