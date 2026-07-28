import type { BitmapShadowBlurOptions } from './BitmapShadowBlurOptions';

export interface BitmapGlowOptions extends BitmapShadowBlurOptions {
  /** Packed 0xRRGGBBAA glow color. Default 0xff0000ff (opaque red). */
  color?: number;
  /** Overall intensity multiplier applied to the glow alpha. Default 1. */
  intensity?: number;
}
