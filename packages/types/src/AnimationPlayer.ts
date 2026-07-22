import type { AnimationClip } from './AnimationClip';
import type { AnimationLoopMode } from './AnimationLoopMode';
import type { Entity } from './Entity';
import type { Signal } from './Signal';

// The explicit time driver for an AnimationClip — the app advances it each frame
// (advanceAnimationPlayer); nothing auto-runs. `time` is the playhead in seconds, `speed` scales the
// advanced dt (negative plays backward), `loop` wraps at the clip duration (otherwise time clamps to
// [0, duration] and `playing` is cleared at the end), and `playing` gates advancement.
//
// `loopMode` (undefined = 'Repeat') selects how looping wraps: 'Repeat' jumps end→start, 'PingPong'
// reflects at each end and flips the sign of `speed`. `repeatCount` (undefined or negative = infinite)
// is the remaining number of loop wraps/bounces permitted; each wrap decrements it and playback stops
// once it reaches zero. `onFinished`/`onLooped` are opt-in signals allocated by
// enableAnimationPlayerSignals — null/undefined until enabled, so a bare player stays signal-free.
export interface AnimationPlayer extends Entity {
  clip: AnimationClip;
  loop: boolean;
  loopMode?: AnimationLoopMode;
  onFinished?: Signal<() => void> | null;
  onLooped?: Signal<() => void> | null;
  playing: boolean;
  repeatCount?: number;
  speed: number;
  time: number;
}
