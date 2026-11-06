import type { Surface } from '@flighthq/surface/contract';

import type { WgpuHostAcquisition } from './WgpuHost.render-wgpu-types.ts';

// Bridge copy of the render-wgpu-owned WgpuSurface for @flighthq/surface, which render-wgpu depends on.
export interface WgpuSurface extends Surface {
  readonly __brand: 'WgpuSurface';
  readonly acquisition: WgpuHostAcquisition;
}
