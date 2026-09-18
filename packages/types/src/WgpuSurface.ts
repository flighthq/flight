import type { Surface } from './Surface';
import type { WgpuHostAcquisition } from './WgpuHost';

// A WGPU rendering surface: a host-allocated drawable with an acquired WebGPU device and presentation
// context. The acquisition carries the device, canvas context, negotiated format, ownership tag, and the
// live-size presentation surface.
export interface WgpuSurface extends Surface {
  readonly __brand: 'WgpuSurface';
  readonly acquisition: WgpuHostAcquisition;
}
