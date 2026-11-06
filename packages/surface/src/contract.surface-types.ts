// Acyclic build entry selected by contract-only projects through the `.surface-types` module suffix.
// The published @flighthq/surface/contract entry remains contract.ts, which also exposes runtime helpers.
export type {
  CanvasSurface,
  HostCanvasCapabilities,
  HostCanvasCapability,
  HostSurfaceCapabilities,
  HostSurfaceContextCapability,
  HostSurfaceDisplayCapability,
  HostSurfaceResizeCapability,
  HostWgpuCapability,
  NativeSurfaceHandle,
  Surface,
  SurfaceWithContext,
  SurfaceRuntime,
  WgpuHostAcquisition,
  WgpuHostAcquisitionOptions,
  WgpuPresentationSurface,
  WgpuSurface,
  WgpuSurfaceAttachResult,
  WgpuSurfaceAttachment,
} from './types.ts';
