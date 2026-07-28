import type { BitmapEdgeMode } from './BitmapEdgeMode';
import type { BitmapResizeMode } from './BitmapResizeMode';

export interface BitmapResizeOptions {
  mode?: BitmapResizeMode;
  edgeMode?: BitmapEdgeMode;
  /**
   * When true, pre-multiplies alpha before interpolation and unpremultiplies
   * after. This prevents the dark-halo bleed that bilinear and bicubic sampling
   * produce at semi-transparent edges when blending in straight-alpha space.
   */
  premultiplied?: boolean;
}
