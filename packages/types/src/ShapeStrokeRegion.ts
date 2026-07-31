import type { ShapeFillRegion } from './ShapeFillRegion';
import type { StrokeStyle } from './StrokeStyle';

// One solid-color stroke span resolved from Shape commands. The path remains the authored centerline;
// GPU renderers pass it and style to tessellateStrokePath so open outlines and closed rings share one
// geometry contract. Extends ShapeFillRegion structurally for common color/alpha/path handling.
export interface ShapeStrokeRegion extends ShapeFillRegion {
  style: StrokeStyle;
}
