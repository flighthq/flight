import type { Entity } from './Entity';
import type { PathWinding } from './ShapeCommand';

// A prepared interpolation between two topology-compatible Paths. Both endpoints have already been
// normalized to the shared command stream: drawing verbs are exact cubic-bezier equivalents and
// unequal segment counts have been reconciled by exact subdivision. `startData` and `endData` are
// index-aligned coordinate buffers consumed by samplePathMorph.
export interface PathMorph extends Entity {
  readonly commands: readonly number[];
  readonly endData: readonly number[];
  readonly startData: readonly number[];
  readonly winding: PathWinding;
}
