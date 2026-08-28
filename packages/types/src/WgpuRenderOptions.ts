import type { Scene3DGraphSyncPolicy } from './RenderState';
import type { WgpuHostAcquisition } from './WgpuHost';

export interface WgpuRenderOptions {
  // Uses these exact host handles instead of asking the process-wide WgpuHostBackend to acquire
  // them. Ownership still controls teardown through that backend.
  acquisition?: WgpuHostAcquisition;
  // Supersample the main surface at 2× in each axis, then resolve it into the canvas. Default: false.
  antialias?: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), split into clear-color channels by renderColor.
  backgroundColor?: number;
  format?: GPUTextureFormat;
  imageSmoothingEnabled?: boolean;
  pixelRatio?: number;
  powerPreference?: GPUPowerPreference;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: Scene3DGraphSyncPolicy;
}
