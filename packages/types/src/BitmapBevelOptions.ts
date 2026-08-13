import type { BitmapBevelType } from './BitmapBevelType';

export interface BitmapBevelOptions {
  /** Light direction in radians, pointing toward the light source. Default π/4. */
  angle?: number;
  /** Sampling offset along the light axis, in pixels. Default 4. */
  distance?: number;
  radiusX?: number;
  radiusY?: number;
  passes?: number;
  /** Packed 0xRRGGBBAA color of the lit edge. Default 0xffffffff. */
  // Packed sRGB RGBA (`0xRRGGBBAA`); the offscreen tint reads all four channels. Default 0xffffffff.
  // ★ BevelEffect.highlightColor, the render-tier sibling, is 24-bit RGB — the two tiers differ.
  highlightColor?: number;
  /** Packed 0xRRGGBBAA color of the shaded edge. Default 0x000000ff. */
  // Packed sRGB RGBA (`0xRRGGBBAA`). Default 0x000000ff.
  shadowColor?: number;
  /** Overall intensity multiplier. Default 1. */
  intensity?: number;
  /** Where the bevel is drawn relative to the shape. Default 'inner'. */
  type?: BitmapBevelType;
}
