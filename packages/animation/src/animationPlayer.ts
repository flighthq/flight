import type { AnimationClip, AnimationPlayer } from '@flighthq/types';

// Advances the playhead by `dt` seconds (scaled by `speed`; negative plays backward). When `loop`,
// time wraps modulo the clip duration; otherwise it clamps to [0, duration] and clears `playing` when
// it reaches an end. No-op while paused or when the clip has zero duration. The app calls this each
// frame — nothing advances on its own.
export function advanceAnimationPlayer(player: AnimationPlayer, dt: number): void {
  if (!player.playing) return;
  const duration = player.clip.duration;
  if (duration <= 0) {
    player.time = 0;
    return;
  }
  let time = player.time + dt * player.speed;
  if (player.loop) {
    time %= duration;
    if (time < 0) time += duration;
  } else if (time >= duration) {
    time = duration;
    player.playing = false;
  } else if (time < 0) {
    time = 0;
    player.playing = false;
  }
  player.time = time;
}

// Allocates a player over `clip`. Defaults: looping, playing, speed 1, time 0.
export function createAnimationPlayer(
  clip: AnimationClip,
  opts?: Readonly<{ loop?: boolean; playing?: boolean; speed?: number; time?: number }>,
): AnimationPlayer {
  return {
    clip,
    loop: opts?.loop ?? true,
    playing: opts?.playing ?? true,
    speed: opts?.speed ?? 1,
    time: opts?.time ?? 0,
  };
}

// Sets the playhead to `time`, clamped to [0, clip.duration]. Does not change `playing`.
export function seekAnimationPlayer(player: AnimationPlayer, time: number): void {
  const duration = player.clip.duration;
  player.time = time < 0 ? 0 : time > duration ? duration : time;
}
