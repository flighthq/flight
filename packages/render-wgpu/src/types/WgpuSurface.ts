import type { SurfaceWithAcquisition } from '@flighthq/surface/contract';

import type { WgpuHostAcquisition } from './WgpuHost.ts';

/** A WGPU rendering surface with its host-acquired device and presentation context. */
export type WgpuSurface = SurfaceWithAcquisition<WgpuHostAcquisition, 'WgpuSurface'>;
