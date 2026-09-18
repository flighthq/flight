import type { Surface } from './HostTarget';
import type { WgpuHostAcquisition } from './WgpuHost';

// A WGPU rendering surface: the binding of a target to an acquired WebGPU device and presentation
// context. Created by createWgpuSurface, which allocates the drawable through HostWgpuCapability, or by
// createWgpuSurfaceFromTarget for a target the host already holds. The acquisition carries the device,
// canvas context, negotiated format, ownership tag, and the live-size presentation surface.
export interface WgpuSurface extends Surface {
  readonly __brand: 'WgpuSurface';
  readonly acquisition: WgpuHostAcquisition;
}
