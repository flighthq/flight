import type { SurfaceBevelType } from './SurfaceBevelType';

export interface SurfaceGradientBevelOptions {
  /** Light direction in radians, pointing toward the light source. Default π/4. */
  angle?: number;
  /** Sampling offset along the light axis, in pixels. Default 4. */
  distance?: number;
  radiusX?: number;
  radiusY?: number;
  passes?: number;
  /** Overall opacity multiplier. Default 1. */
  intensity?: number;
  /** Where the bevel is drawn relative to the shape. Default 'inner'. */
  type?: SurfaceBevelType;
}
