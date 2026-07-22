import type { AnimationTrack } from './AnimationTrack';
import type { Entity } from './Entity';

// One channel of an AnimationClip: a track plus an opaque `targetRef`. The animation core never
// interprets `targetRef` — binding a sampled value to a SceneNode TRS, a bone, or a tween target is
// the domain layer's job (scene / skeleton / tween). This is what keeps the core target-free and 3D-free.
export interface AnimationChannel extends Entity {
  track: AnimationTrack;
  targetRef: unknown;
}
