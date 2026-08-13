import type { Scene3DGraphSyncPolicy } from './RenderState';

export interface GlRenderOptions {
  allowSmoothing?: boolean;
  // Multisample (MSAA) the rasterized geometry edges via the Gl2 context. Defaults to true, so
  // shape and mask edges are anti-aliased out of the box; pass false to opt out (e.g. pixel-art
  // crispness, or to save fill cost). This is geometric edge AA only — image/texture filtering is
  // the separate `imageSmoothingEnabled` knob.
  antialias?: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), split into clear-color channels by renderColor.
  backgroundColor?: number;
  contextAttributes?: WebGLContextAttributes;
  imageSmoothingEnabled?: boolean;
  pixelRatio?: number;
  powerPreference?: WebGLPowerPreference;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: Scene3DGraphSyncPolicy;
}
