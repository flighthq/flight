import { clearSignal, createSignal, emitSignal } from '@flighthq/signals';
import type { Spritesheet, SpritesheetAnimation, SpritesheetFrame, SpritesheetPlayer } from '@flighthq/types';

export function acquireSpritesheetPlayer(): SpritesheetPlayer {
  if (playerPool.length > 0) {
    const p = playerPool.pop()!;
    // Reset to a clean idle state (signals are already disconnected by releaseSpritesheetPlayer).
    p.animation = null;
    p.complete = true;
    p.elapsed = 0;
    p.frameIndex = 0;
    p.paused = false;
    p.queue.length = 0;
    p.speed = 1;
    return p;
  }
  return createSpritesheetPlayer();
}

export function cloneSpritesheetPlayer(player: Readonly<SpritesheetPlayer>): SpritesheetPlayer {
  return {
    animation: player.animation,
    complete: player.complete,
    elapsed: player.elapsed,
    frameIndex: player.frameIndex,
    onComplete: createSignal(),
    onLoop: createSignal(),
    paused: player.paused,
    queue: [...player.queue],
    speed: player.speed,
  };
}

export function createSpritesheetPlayer(obj?: Partial<SpritesheetPlayer>): SpritesheetPlayer {
  return {
    animation: obj?.animation ?? null,
    complete: obj?.complete ?? true,
    elapsed: obj?.elapsed ?? 0,
    frameIndex: obj?.frameIndex ?? 0,
    onComplete: obj?.onComplete ?? createSignal(),
    onLoop: obj?.onLoop ?? createSignal(),
    paused: obj?.paused ?? false,
    queue: obj?.queue ?? [],
    speed: obj?.speed ?? 1,
  };
}

export function disposeSpritesheetPlayer(player: SpritesheetPlayer): void {
  clearSignal(player.onComplete);
  clearSignal(player.onLoop);
  player.animation = null;
  player.complete = true;
  player.queue.length = 0;
}

export function getSpritesheetPlayerFrame(
  player: Readonly<SpritesheetPlayer>,
  spritesheet: Readonly<Spritesheet>,
): SpritesheetFrame | null {
  const { animation, frameIndex } = player;
  if (animation === null || animation.frames.length === 0) return null;
  const spriteFrameIndex = animation.frames[frameIndex];
  return spritesheet.frames[spriteFrameIndex] ?? null;
}

// Returns the `SpritesheetFrame` for a neighbor frame offset relative to the current playback head,
// without mutating the player. Positive `frameOffset` looks ahead; negative looks behind.
// The offset wraps within the animation's frame list. Returns null when no animation is set or
// the animation has no frames.
// Primary use: onion-skin preview in editors (show neighboring frames without advancing the head).
export function getSpritesheetPlayerFrameAt(
  player: Readonly<SpritesheetPlayer>,
  spritesheet: Readonly<Spritesheet>,
  frameOffset: number,
): SpritesheetFrame | null {
  const { animation, frameIndex } = player;
  if (animation === null || animation.frames.length === 0) return null;
  const n = animation.frames.length;
  // Wrap the offset within [0, n) using positive modulo.
  const targetIndex = (((frameIndex + frameOffset) % n) + n) % n;
  const spriteFrameIndex = animation.frames[targetIndex];
  return spritesheet.frames[spriteFrameIndex] ?? null;
}

export function pauseSpritesheetPlayer(player: SpritesheetPlayer): void {
  player.paused = true;
}

export function playSpritesheetAnimation(
  player: SpritesheetPlayer,
  animation: Readonly<SpritesheetAnimation> | null,
  restart = true,
): void {
  if (!restart && animation === player.animation) return;
  player.animation = animation;
  player.complete = animation === null;
  player.elapsed = 0;
  player.frameIndex = 0;
  player.queue.length = 0;
}

export function queueSpritesheetAnimation(player: SpritesheetPlayer, animation: Readonly<SpritesheetAnimation>): void {
  player.queue.push(animation);
}

// Returns a player acquired from the pool to the pool for reuse.
// Disconnects all signals before returning — the next acquire starts with fresh signal state.
// Every `acquireSpritesheetPlayer` call must have a matching `releaseSpritesheetPlayer`.
export function releaseSpritesheetPlayer(player: SpritesheetPlayer): void {
  clearSignal(player.onComplete);
  clearSignal(player.onLoop);
  player.animation = null;
  player.complete = true;
  player.elapsed = 0;
  player.frameIndex = 0;
  player.paused = false;
  player.queue.length = 0;
  player.speed = 1;
  playerPool.push(player);
}

export function resumeSpritesheetPlayer(player: SpritesheetPlayer): void {
  player.paused = false;
}

export function seekSpritesheetPlayerToFrame(player: SpritesheetPlayer, frameIndex: number): void {
  const { animation } = player;
  if (animation === null || animation.frames.length === 0) return;
  const clamped = Math.max(0, Math.min(frameIndex, animation.frames.length - 1));
  player.frameIndex = clamped;
  // Sync elapsed to the start of the target virtual frame index that maps to this display frame.
  // For simplicity, seek to the first virtual index that produces this display frame.
  player.elapsed = resolveVirtualIndexStartTime(animation, clamped);
}

export function seekSpritesheetPlayerToTime(player: SpritesheetPlayer, time: number): void {
  const { animation } = player;
  if (animation === null || animation.frames.length === 0) return;
  const totalTime = resolveAnimationTotalTime(animation);
  player.elapsed = Math.max(0, Math.min(time, totalTime));
  player.frameIndex = resolveFrameIndexFromElapsed(animation, player.elapsed);
}

export function stopSpritesheetPlayer(player: SpritesheetPlayer): void {
  player.elapsed = 0;
  player.frameIndex = 0;
  player.complete = true;
  player.queue.length = 0;
}

export function updateSpritesheetPlayer(player: SpritesheetPlayer, deltaTime: number): boolean {
  const { animation } = player;
  if (animation === null || player.complete || player.paused || animation.frames.length === 0) return false;
  const { loop } = animation;
  const totalTime = resolveAnimationTotalTime(animation);
  const prevLoopCount = Math.floor(player.elapsed / totalTime);
  player.elapsed += deltaTime * player.speed;
  if (!loop && player.elapsed >= totalTime) {
    if (player.queue.length > 0) {
      const next = player.queue.shift()!;
      player.animation = next;
      player.elapsed = 0;
      player.frameIndex = 0;
      return true;
    }
    player.elapsed = totalTime;
    // On completion, show the last virtual frame in the direction sequence.
    const lastVi = resolveVirtualFrameCount(animation) - 1;
    player.frameIndex = resolveVirtualIndexToDisplayIndex(animation, lastVi);
    player.complete = true;
    emitSignal(player.onComplete);
    return true;
  }
  if (Math.floor(player.elapsed / totalTime) > prevLoopCount) emitSignal(player.onLoop);
  const timeInLoop = player.elapsed % totalTime;
  const vi = resolveVirtualIndexFromTime(animation, timeInLoop);
  player.frameIndex = resolveVirtualIndexToDisplayIndex(animation, vi);
  return true;
}

// Returns a cached cumulative-duration array for variable-timing animations.
// The array has virtualCount+1 entries: [0, d0, d0+d1, ..., total].
function getCumulativeDurations(animation: Readonly<SpritesheetAnimation>): Float64Array {
  const cached = cumulativeDurationsCache.get(animation);
  if (cached !== undefined) return cached;
  const { frames, frameDuration, frameDurations } = animation;
  const n = frames.length;
  const virtualCount = resolveVirtualFrameCount(animation);
  const arr = new Float64Array(virtualCount + 1);
  let t = 0;
  for (let vi = 0; vi < virtualCount; vi++) {
    arr[vi] = t;
    // Map virtual index to the forward frame index for the duration lookup.
    const fi = vi < n ? vi : 2 * (n - 1) - vi;
    t += frameDurations![fi] ?? frameDuration;
  }
  arr[virtualCount] = t || 1;
  cumulativeDurationsCache.set(animation, arr);
  return arr;
}

// Computes the total duration of one full virtual loop of the animation (ms).
// For variable-duration animations, delegates to the cached cumulative array (O(1) after warm-up).
function resolveAnimationTotalTime(animation: Readonly<SpritesheetAnimation>): number {
  const { frameDuration, frameDurations } = animation;
  if (frameDurations !== null) {
    // Use the precomputed cumulative array: total is the last entry.
    const arr = getCumulativeDurations(animation);
    return arr[arr.length - 1];
  }
  const virtualCount = resolveVirtualFrameCount(animation);
  return virtualCount * frameDuration || 1;
}

// Resolves a display frame index from elapsed time (used by seekSpritesheetPlayerToTime).
function resolveFrameIndexFromElapsed(animation: Readonly<SpritesheetAnimation>, elapsed: number): number {
  const totalTime = resolveAnimationTotalTime(animation);
  const timeInLoop = elapsed % totalTime;
  const vi = resolveVirtualIndexFromTime(animation, timeInLoop);
  return resolveVirtualIndexToDisplayIndex(animation, vi);
}

// Returns the virtual frame count for an animation. Pingpong directions double the frame count
// minus two endpoints: [0,1,2] → virtual [0,1,2,1] = 4 virtual frames (2*3-2=4).
function resolveVirtualFrameCount(animation: Readonly<SpritesheetAnimation>): number {
  const n = animation.frames.length;
  const isPingpong = animation.direction === 'pingpong' || animation.direction === 'pingpong_reverse';
  if (isPingpong && n > 1) return 2 * n - 2;
  return n;
}

// Given time within a single loop, returns the virtual frame index (direction-agnostic step count).
// For variable-duration animations, uses the precomputed cumulative array for O(log n) binary search.
function resolveVirtualIndexFromTime(animation: Readonly<SpritesheetAnimation>, timeInLoop: number): number {
  const { frameDuration, frameDurations } = animation;
  const virtualCount = resolveVirtualFrameCount(animation);
  if (frameDurations !== null) {
    // Binary search in the precomputed cumulative array.
    const arr = getCumulativeDurations(animation);
    let lo = 0;
    let hi = virtualCount - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (arr[mid] <= timeInLoop) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }
  return Math.min(Math.floor(timeInLoop / frameDuration), virtualCount - 1);
}

// Returns the elapsed time at the start of the given virtual frame index (for seeking).
// Uses the precomputed cumulative array when available.
function resolveVirtualIndexStartTime(animation: Readonly<SpritesheetAnimation>, virtualIndex: number): number {
  const { frameDuration, frameDurations } = animation;
  if (frameDurations !== null) {
    const arr = getCumulativeDurations(animation);
    return arr[virtualIndex];
  }
  return virtualIndex * frameDuration;
}

// Given a virtual frame index (0..virtualCount-1), returns the display frame index
// (0..frames.length-1) accounting for direction.
function resolveVirtualIndexToDisplayIndex(animation: Readonly<SpritesheetAnimation>, virtualIndex: number): number {
  const { direction, frames } = animation;
  const last = frames.length - 1;
  switch (direction) {
    case 'forward':
      return virtualIndex;
    case 'reverse':
      return last - virtualIndex;
    case 'pingpong':
      // Virtual: [0,1,...,last, last-1,...,1] — forward then backward (no endpoint repeat).
      return virtualIndex <= last ? virtualIndex : 2 * last - virtualIndex;
    case 'pingpong_reverse':
      // Virtual: [last,...,0, 1,...,last-1] — reverse then forward.
      return virtualIndex <= last ? last - virtualIndex : virtualIndex - last;
    default:
      return virtualIndex;
  }
}

// Pool for short-lived players — use acquire/release as paired brackets.
const playerPool: SpritesheetPlayer[] = [];

// Cached cumulative virtual-frame start times per animation instance.
// Key: SpritesheetAnimation entity. Value: Float64Array of length (virtualCount + 1) where
// entry[i] = start time of virtual frame i, entry[virtualCount] = total loop time.
// Built lazily on first access for variable-duration animations; uniform animations never need it.
const cumulativeDurationsCache = new WeakMap<Readonly<SpritesheetAnimation>, Float64Array>();
