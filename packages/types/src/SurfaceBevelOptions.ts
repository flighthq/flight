import type { SurfaceBevelType } from './SurfaceBevelType';

export interface SurfaceBevelOptions {
  /** Light direction in radians, pointing toward the light source. Default π/4. */
  angle?: number;
  /** Sampling offset along the light axis, in pixels. Default 4. */
  distance?: number;
  radiusX?: number;
  radiusY?: number;
  passes?: number;
  /** Packed 0xRRGGBBAA color of the lit edge. Default 0xffffffff. */
  highlightColor?: number;
  /** Packed 0xRRGGBBAA color of the shaded edge. Default 0x000000ff. */
  shadowColor?: number;
  /** Overall intensity multiplier. Default 1. */
  intensity?: number;
  /** Where the bevel is drawn relative to the shape. Default 'inner'. */
  type?: SurfaceBevelType;
}
