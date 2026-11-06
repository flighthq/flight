export { createCanvasSurface, createCanvasSurfaceFromNativeHandle, destroyCanvasSurface } from './contract.ts';
export { createGlSurface, createGlSurfaceFromNativeHandle, destroyGlSurface } from './contract.ts';
export { createWgpuSurface, createWgpuSurfaceFromNativeHandle, destroyWgpuSurface } from './contract.ts';
export { resizeSurface, setSurfaceDisplaySize } from './contract.ts';
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
} from './contract.ts';
