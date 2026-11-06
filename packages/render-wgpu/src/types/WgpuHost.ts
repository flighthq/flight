// Surface owns the host lifecycle contract. These re-exports preserve render-wgpu's established API.
export type {
  HostWgpuCapability,
  WgpuHostAcquisition,
  WgpuHostAcquisitionOptions,
  WgpuPresentationSurface,
  WgpuSurfaceAttachResult,
  WgpuSurfaceAttachment,
} from '@flighthq/surface/contract';
