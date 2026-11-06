// Exact bridge for @flighthq/surface runtime: render-wgpu owns these WGPU contracts but depends on surface,
// so surface selects this entry through the `.surface-bridge-types` module suffix.
export type {
  HostWgpuCapability,
  WgpuHostAcquisition,
  WgpuHostAcquisitionOptions,
} from './WgpuHost.render-wgpu-types.ts';
export type { WgpuSurface } from './WgpuSurface.surface-bridge-types.ts';
