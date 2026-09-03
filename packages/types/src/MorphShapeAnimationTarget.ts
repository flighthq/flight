import type { Entity } from './Entity';
import type { MorphShape } from './MorphShape';

// The opaque targetRef carried by a scalar AnimationChannel that drives one MorphShape's progress.
// Reuse one descriptor identity across clips that must correspond in crossfades, blend trees, state
// machines, or layer stacks; the target-free animation core matches channels by targetRef identity.
export interface MorphShapeAnimationTarget extends Entity {
  shape: MorphShape;
}
