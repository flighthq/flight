import type { Entity } from './Entity';
import type { HostTarget } from './HostTarget';
import type { WgpuHostAcquisition } from './WgpuHost';

// A WGPU rendering surface: the binding of a HostTarget to an acquired WebGPU device and
// presentation context. Created by createWgpuSurface, which acquires the device through
// HostWgpuCapability and bundles it with the target identity. The acquisition carries the device,
// canvas context, negotiated format, and ownership tag.
export interface WgpuSurface extends Entity {
  readonly __brand: 'WgpuSurface';
  readonly acquisition: WgpuHostAcquisition;
  readonly target: HostTarget;
}
