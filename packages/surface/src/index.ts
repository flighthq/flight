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
  NativeSurfaceHandle,
  Surface,
  SurfaceWithContext,
  SurfaceRuntime,
} from './contract.ts';
