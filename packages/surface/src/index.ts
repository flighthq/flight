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
  HostWgpuSurfaceCapability,
  NativeSurfaceHandle,
  Surface,
  SurfaceWithContext,
  SurfaceRuntime,
  SurfaceWithAcquisition,
  WgpuPresentationSurface,
} from './contract.ts';
export { attachWindowRenderState, detachWindowRenderState } from './contract.ts';
