import type { AnimationClip } from './AnimationClip';

// The explicit time driver for an AnimationClip — the app advances it each frame
// (advanceAnimationPlayer); nothing auto-runs. `time` is the playhead in seconds, `speed` scales the
// advanced dt (negative plays backward), `loop` wraps at the clip duration (otherwise time clamps to
// [0, duration] and `playing` is cleared at the end), and `playing` gates advancement.
export interface AnimationPlayer {
  clip: AnimationClip;
  loop: boolean;
  playing: boolean;
  speed: number;
  time: number;
}
