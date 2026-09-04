import type { Raster2DSurfaceProvider } from './Raster2DSurface';
import type { Scene3DGraphSyncPolicy } from './RenderState';

export interface WgpuRenderOptions {
  // Supersample the main surface at 2× in each axis, then resolve it into the canvas. Default: false.
  antialias?: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), split into clear-color channels by renderColor.
  backgroundColor?: number;
  // Device-only states have no acquisition from which to derive a default render-target format.
  // Presentation creation always supplies the acquired format; direct offscreen creation defaults to
  // bgra8unorm unless the caller selects another immutable state format here.
  format?: GPUTextureFormat;
  imageSmoothingEnabled?: boolean;
  pixelRatio?: number;
  raster2DSurfaceProvider?: Readonly<Raster2DSurfaceProvider>;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: Scene3DGraphSyncPolicy;
}
