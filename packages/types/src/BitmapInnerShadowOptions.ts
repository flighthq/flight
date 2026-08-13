import type { BitmapShadowBlurOptions } from './BitmapShadowBlurOptions';

export interface BitmapInnerShadowOptions extends BitmapShadowBlurOptions {
  /** Packed 0xRRGGBBAA inner shadow color. Default 0x000000ff (opaque black). */
  // Packed sRGB RGBA (`0xRRGGBBAA`). Default 0x000000ff.
  color?: number;
  /** Overall intensity multiplier applied to the shadow alpha. Default 1. */
  intensity?: number;
  /**
   * Pixel offset of the shadow inside the shape, from the filter's angle+distance (dx = cos(angle) *
   * distance, dy = sin(angle) * distance; see getShadowFilterOffset). The inverted-alpha field is
   * sampled shifted by (offsetX, offsetY) before the blur, so the shadow lands off-center against the
   * boundary — the Photoshop/OpenFL inner-shadow construction. Default 0 (shadow centered on the edge).
   */
  offsetX?: number;
  offsetY?: number;
}
