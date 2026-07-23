import type { SurfaceEdgeMode } from './SurfaceEdgeMode';
import type { SurfaceResizeMode } from './SurfaceResizeMode';

export interface SurfaceResizeOptions {
  mode?: SurfaceResizeMode;
  edgeMode?: SurfaceEdgeMode;
  /**
   * When true, pre-multiplies alpha before interpolation and unpremultiplies
   * after. This prevents the dark-halo bleed that bilinear and bicubic sampling
   * produce at semi-transparent edges when blending in straight-alpha space.
   */
  premultiplied?: boolean;
}
