import type { Scene3DGraphSyncPolicy } from './RenderState';

export interface GlRenderOptions {
  allowSmoothing?: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), split into clear-color channels by renderColor.
  backgroundColor?: number;
  imageSmoothingEnabled?: boolean;
  // Pixel ratio is render configuration: createGlRenderState consumes it while the caller owns and
  // sizes the surface independently.
  pixelRatio?: number;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: Scene3DGraphSyncPolicy;
}
