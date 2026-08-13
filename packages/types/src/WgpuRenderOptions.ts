import type { Scene3DGraphSyncPolicy } from './RenderState';

export interface WgpuRenderOptions {
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
