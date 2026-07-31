import type { StrokePathTessellationReason } from './StrokePathTessellationReason';

// Detached plain-data diagnostic for tessellateStrokePath. `subpath` is the zero-based flattened
// contour that first made the direct stroke mesh unsupported, or null for a style-wide failure.
export interface StrokePathTessellationExplanation {
  readonly reason: StrokePathTessellationReason;
  readonly subpath: number | null;
  readonly supported: boolean;
}
