import { createEntity } from '@flighthq/entity';
import { createSignal, emitSignal } from '@flighthq/signals';
import type { AnimationClip, AnimationLoopMode, AnimationPlayer } from '@flighthq/types';
import { AnimationLoopModePingPong, AnimationLoopModeRepeat } from '@flighthq/types';

// Advances the playhead by `dt` seconds (scaled by `speed`; negative plays backward). When `loop`,
// time wraps at the clip duration per `loopMode` — 'Repeat' jumps end→start, 'PingPong' reflects and
// reverses `speed`; each wrap/bounce spends one unit of `repeatCount` (negative/undefined = infinite)
// and playback stops when the budget is exhausted. When not looping, time clamps to [0, duration] and
// clears `playing` at either end. Emits the opt-in onLooped/onFinished signals (null-guarded, so bare
// players cost nothing). No-op while paused or when the clip has zero duration. The app calls this each
// frame — nothing advances on its own.
export function advanceAnimationPlayer(player: AnimationPlayer, dt: number): void {
  if (!player.playing) return;
  const duration = player.clip.duration;
  if (duration <= 0) {
    player.time = 0;
    return;
  }
  let time = player.time + dt * player.speed;

  if (!player.loop) {
    if (time >= duration) {
      player.time = duration;
      player.playing = false;
      emitAnimationPlayerFinished(player);
    } else if (time < 0) {
      player.time = 0;
      player.playing = false;
      emitAnimationPlayerFinished(player);
    } else {
      player.time = time;
    }
    return;
  }

  let looped = false;
  if (player.loopMode === AnimationLoopModePingPong) {
    // Reflect at each boundary, flipping the travel direction (`speed` sign). A loop handles a `dt`
    // large enough to cross a boundary more than once.
    for (;;) {
      if (time > duration) {
        if (!consumeAnimationPlayerLoop(player)) {
          finishAnimationPlayerAt(player, duration);
          return;
        }
        time = 2 * duration - time;
        player.speed = -player.speed;
        looped = true;
      } else if (time < 0) {
        if (!consumeAnimationPlayerLoop(player)) {
          finishAnimationPlayerAt(player, 0);
          return;
        }
        time = -time;
        player.speed = -player.speed;
        looped = true;
      } else {
        break;
      }
    }
  } else {
    while (time >= duration) {
      if (!consumeAnimationPlayerLoop(player)) {
        finishAnimationPlayerAt(player, duration);
        return;
      }
      time -= duration;
      looped = true;
    }
    while (time < 0) {
      if (!consumeAnimationPlayerLoop(player)) {
        finishAnimationPlayerAt(player, 0);
        return;
      }
      time += duration;
      looped = true;
    }
  }

  player.time = time;
  if (looped) emitAnimationPlayerLooped(player);
}

// Shallow-copies a player into a fresh, independent driver. The `clip` (and thus its buffers) is shared
// by reference — players are lightweight drivers over a clip; clone the clip separately for independent
// buffers. The clone starts signal-free (onFinished/onLooped null) so listeners are never shared.
export function cloneAnimationPlayer(player: Readonly<AnimationPlayer>): AnimationPlayer {
  return createEntity({
    clip: player.clip,
    loop: player.loop,
    loopMode: player.loopMode,
    onFinished: null,
    onLooped: null,
    playing: player.playing,
    repeatCount: player.repeatCount,
    speed: player.speed,
    time: player.time,
  });
}

// Allocates a player over `clip`. Defaults: looping, 'Repeat' loop mode, infinite repeats, playing,
// speed 1, time 0, and signal-free (onFinished/onLooped null until enableAnimationPlayerSignals).
export function createAnimationPlayer(
  clip: AnimationClip,
  opts?: Readonly<{
    loop?: boolean;
    loopMode?: AnimationLoopMode;
    playing?: boolean;
    repeatCount?: number;
    speed?: number;
    time?: number;
  }>,
): AnimationPlayer {
  return createEntity({
    clip,
    loop: opts?.loop ?? true,
    loopMode: opts?.loopMode ?? AnimationLoopModeRepeat,
    onFinished: null,
    onLooped: null,
    playing: opts?.playing ?? true,
    repeatCount: opts?.repeatCount ?? -1,
    speed: opts?.speed ?? 1,
    time: opts?.time ?? 0,
  });
}

// Allocates and attaches the opt-in player signals (onFinished, onLooped) to a player created before
// they were needed. Idempotent — calling twice does not create duplicate signals.
export function enableAnimationPlayerSignals(player: AnimationPlayer): void {
  if (player.onFinished == null) player.onFinished = createSignal();
  if (player.onLooped == null) player.onLooped = createSignal();
}

// Returns the playhead as a fraction of the clip duration, clamped to [0, 1] (time / duration).
// Returns 0 for a zero-duration clip.
export function getAnimationPlayerNormalizedTime(player: Readonly<AnimationPlayer>): number {
  const duration = player.clip.duration;
  if (duration <= 0) return 0;
  const n = player.time / duration;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

// Resumes advancement by setting `playing` true, leaving the playhead where it is. Symmetric with
// stopAnimationPlayer; pair with seekAnimationPlayer to choose a start point first.
export function playAnimationPlayer(player: AnimationPlayer): void {
  player.playing = true;
}

// Sets the playhead to `time`, clamped to [0, clip.duration]. Does not change `playing`.
export function seekAnimationPlayer(player: AnimationPlayer, time: number): void {
  const duration = player.clip.duration;
  player.time = time < 0 ? 0 : time > duration ? duration : time;
}

// Halts advancement and rewinds: clears `playing` and resets the playhead to 0. Symmetric with
// playAnimationPlayer; use seekAnimationPlayer to stop the player in place instead.
export function stopAnimationPlayer(player: AnimationPlayer): void {
  player.playing = false;
  player.time = 0;
}

// Spends one unit of the player's finite repeat budget, returning whether a wrap/bounce is still
// permitted. A negative or undefined `repeatCount` means infinite (always permitted); 0 means the
// budget is exhausted.
function consumeAnimationPlayerLoop(player: AnimationPlayer): boolean {
  const rc = player.repeatCount;
  if (rc === undefined || rc < 0) return true;
  if (rc === 0) return false;
  player.repeatCount = rc - 1;
  return true;
}

function emitAnimationPlayerFinished(player: Readonly<AnimationPlayer>): void {
  if (player.onFinished != null) emitSignal(player.onFinished);
}

function emitAnimationPlayerLooped(player: Readonly<AnimationPlayer>): void {
  if (player.onLooped != null) emitSignal(player.onLooped);
}

// Clamps the playhead to `time`, clears `playing`, and emits onFinished — the shared end-of-playback
// path when a non-looping run or an exhausted repeat budget reaches a boundary.
function finishAnimationPlayerAt(player: AnimationPlayer, time: number): void {
  player.time = time;
  player.playing = false;
  emitAnimationPlayerFinished(player);
}
