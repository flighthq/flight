import type { Scene3DGraphSyncPolicy } from './RenderState';

export interface WgpuRenderOptions {
  // Supersample the main surface at 2× in each axis, then resolve it into the canvas. Default: false.
  antialias?: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), split into clear-color channels by renderColor.
  backgroundColor?: number;
  imageSmoothingEnabled?: boolean;
  pixelRatio?: number;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: Scene3DGraphSyncPolicy;
}
