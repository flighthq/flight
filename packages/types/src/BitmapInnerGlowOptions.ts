import type { BitmapShadowBlurOptions } from './BitmapShadowBlurOptions';

export interface BitmapInnerGlowOptions extends BitmapShadowBlurOptions {
  /** Packed 0xRRGGBBAA inner glow color. Default 0xff0000ff (opaque red). */
  // Packed sRGB RGBA (`0xRRGGBBAA`). Default 0xff0000ff.
  color?: number;
  /** Overall intensity multiplier applied to the glow alpha. Default 1. */
  intensity?: number;
}
