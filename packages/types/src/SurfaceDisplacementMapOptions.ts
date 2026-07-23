import type { SurfaceDisplacementMapMode } from './SurfaceDisplacementMapMode';
import type { SurfaceEdgeMode } from './SurfaceEdgeMode';
import type { SurfaceRegion } from './SurfaceRegion';

export interface SurfaceDisplacementMapOptions {
  /** Map surface whose channels drive the per-pixel displacement. */
  map: Readonly<SurfaceRegion>;
  /** Channel index (0=R, 1=G, 2=B, 3=A) of `map` that drives X displacement. Default 0. */
  componentX?: number;
  /** Channel index (0=R, 1=G, 2=B, 3=A) of `map` that drives Y displacement. Default 1. */
  componentY?: number;
  /**
   * X displacement scale in pixels. A map value of 128 produces no shift; 0
   * shifts by -0.5 × scaleX; 255 shifts by +0.5 × scaleX. Default 0.
   */
  scaleX?: number;
  /** Y displacement scale in pixels. Default 0. */
  scaleY?: number;
  /** How to handle sample positions that fall outside the source region. Default 'wrap'. */
  mode?: SurfaceDisplacementMapMode;
  /**
   * Standard edge mode — when set, overrides `mode` for standard edge behaviours.
   * Use for API consistency with other surface geometric ops. Default undefined
   * (falls back to `mode`).
   */
  edgeMode?: SurfaceEdgeMode;
  /** Packed 0xRRGGBBAA fill used when `mode` is 'color'. Default 0. */
  fillColor?: number;
}
