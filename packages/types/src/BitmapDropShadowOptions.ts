import type { BitmapShadowBlurOptions } from './BitmapShadowBlurOptions';

export interface BitmapDropShadowOptions extends BitmapShadowBlurOptions {
  /** Packed 0xRRGGBBAA shadow color. Default 0x000000ff (opaque black). */
  color?: number;
  /** Overall intensity multiplier applied to the shadow alpha. Default 1. */
  intensity?: number;
}
