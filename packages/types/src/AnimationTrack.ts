import type { AnimationInterpolation } from './AnimationInterpolation';
import type { EasingFunction } from './EasingFunction';

// A target-free animation curve: ascending keyframe `times` plus a flat `values` buffer, sampled by
// sampleAnimationTrack. `components` is the value width per keyframe (1 = scalar, 3 = Vector3, 4 =
// Quaternion or packed color). For 'Step'/'Linear' the buffer holds `components` numbers per keyframe;
// for 'Cubic' it holds 3 * `components` per keyframe (in-tangent, value, out-tangent), glTF-style.
// When `quaternion` is true the four components are a unit quaternion [x, y, z, w] and 'Linear'
// sampling slerps instead of interpolating component-wise. `easing`, when non-null, reshapes the
// per-segment interpolation alpha (the bridge to @flighthq/easing's curves) — null is the raw curve.
export interface AnimationTrack {
  interpolation: AnimationInterpolation;
  times: ArrayLike<number>;
  values: ArrayLike<number>;
  components: number;
  quaternion: boolean;
  easing: EasingFunction | null;
}
