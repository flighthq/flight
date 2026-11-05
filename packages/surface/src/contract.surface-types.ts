// Acyclic build entry selected by contract-only projects through the `.surface-types` module suffix.
// The published @flighthq/surface/contract entry remains contract.ts, which also exposes runtime helpers.
export type {
  CanvasSurface,
  HostCanvasCapabilities,
  HostCanvasCapability,
  HostSurfaceCapabilities,
  HostSurfaceDisplayCapability,
  HostSurfaceResizeCapability,
  NativeSurfaceHandle,
  Surface,
  SurfaceRuntime,
} from './types.ts';
