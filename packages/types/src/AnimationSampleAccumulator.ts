import type { Entity } from './Entity';

// Caller-visible weighted animation-sample accumulation state. `values` is the weighted component
// sum, `weight` its total, and `quaternion` selects hemisphere-aware quaternion finalization for a
// four-component sample. Reset/reuse it across channels or frames; it owns no target binding.
export interface AnimationSampleAccumulator extends Entity {
  components: number;
  quaternion: boolean;
  values: Float32Array;
  weight: number;
}
