import type { PathMorphCreationReason } from './PathMorphCreationReason';

// Detached plain-data diagnostic for createPathMorph. `contour` identifies the first incompatible
// zero-based contour, or is null when the issue applies to the whole path pair.
export interface PathMorphCreationExplanation {
  readonly contour: number | null;
  readonly reason: PathMorphCreationReason;
  readonly supported: boolean;
}
