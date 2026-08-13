import type { BitmapShadowBlurOptions } from './BitmapShadowBlurOptions';

export interface BitmapDropShadowOptions extends BitmapShadowBlurOptions {
  /** Packed 0xRRGGBBAA shadow color. Default 0x000000ff (opaque black). */
  // Packed sRGB RGBA (`0xRRGGBBAA`); the offscreen tint reads all four channels. Default 0x000000ff.
  // ★ DropShadowEffect.color, the render-tier sibling, is 24-bit RGB — the two tiers differ.
  color?: number;
  /** Overall intensity multiplier applied to the shadow alpha. Default 1. */
  intensity?: number;
}
