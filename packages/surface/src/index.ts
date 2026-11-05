export { createCanvasSurface, createCanvasSurfaceFromNativeHandle, destroyCanvasSurface } from './contract.ts';
export { createGlSurface, createGlSurfaceFromNativeHandle, destroyGlSurface } from './contract.ts';
export { createWgpuSurface, createWgpuSurfaceFromNativeHandle, destroyWgpuSurface } from './contract.ts';
export { resizeSurface, setSurfaceDisplaySize } from './contract.ts';
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
} from './contract.ts';
