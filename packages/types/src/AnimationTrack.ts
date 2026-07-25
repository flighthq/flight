import type { AnimationInterpolation } from './AnimationInterpolation';
import type { EasingFunction } from './EasingFunction';
import type { Entity } from './Entity';

// A target-free animation curve: ascending keyframe `times` plus a flat `values` buffer, sampled by
// sampleAnimationTrack. `components` is the value width per keyframe (1 = scalar, 3 = Vector3, 4 =
// Quaternion or packed color). For 'Step'/'Linear' the buffer holds `components` numbers per keyframe;
// for 'Cubic' it holds 3 * `components` per keyframe (in-tangent, value, out-tangent), glTF-style.
// When `quaternion` is true the four components are a unit quaternion [x, y, z, w] and 'Linear'
// sampling slerps instead of interpolating component-wise. `easing`, when non-null, reshapes the
// interpolation alpha for every segment. `segmentEasings`, when non-null, contains one optional
// override per interval (`times.length - 1`); a null entry falls back to the track-wide easing.
export interface AnimationTrack extends Entity {
  interpolation: AnimationInterpolation;
  times: ArrayLike<number>;
  values: ArrayLike<number>;
  components: number;
  quaternion: boolean;
  easing: EasingFunction | null;
  segmentEasings: ReadonlyArray<EasingFunction | null> | null;
}
