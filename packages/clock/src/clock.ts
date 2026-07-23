import { clearSignal, emitSignal } from '@flighthq/signals';
import type { Clock, ClockOptions } from '@flighthq/types';

// Attaches `child` under `parent`, detaching it from any previous parent first (reparent-safe). After
// this, advancing `parent` cascades into `child`. A no-op if `child` is already parented here.
export function addClockChild(parent: Clock, child: Clock): void {
  if (child.parent === parent) return;
  if (child.parent !== null) removeClockChild(child.parent, child);
  child.parent = parent;
  parent.children.push(child);
}

// Advances a clock tree by one step. `deltaSeconds` is the real elapsed seconds for a root clock (the
// value the frame loop supplies); the cascade feeds each child its parent's already-scaled delta. Each
// clock's scaled delta is `paused ? 0 : deltaSeconds * scale`; that becomes its deltaTime, accumulates
// into elapsed, emits its (opt-in) onTick, and drives its children — so scale and pause compose down the
// whole subtree in one pass. Pre-order: a clock's onTick fires before its children advance. Call once per
// frame on the root: advanceClock(root, dtSeconds).
export function advanceClock(clock: Clock, deltaSeconds: number): void {
  const scaledDelta = clock.paused ? 0 : deltaSeconds * clock.scale;
  clock.deltaTime = scaledDelta;
  clock.elapsed += scaledDelta;
  if (clock.onTick !== null) emitSignal(clock.onTick, scaledDelta);
  const children = clock.children;
  for (let i = 0; i < children.length; i++) {
    advanceClock(children[i], scaledDelta);
  }
}

// Allocates a child clock and attaches it to `parent` in one step. Equivalent to createClock followed by
// addClockChild; the child inherits `parent`'s scale and pause state through the advanceClock cascade.
export function createChildClock(parent: Clock, options?: Readonly<ClockOptions>): Clock {
  const child = createClock(options);
  addClockChild(parent, child);
  return child;
}

// Allocates a root clock (no parent). Defaults to realtime and running; pass options to start scaled or
// paused. Drive it each frame with advanceClock(clock, dtSeconds).
export function createClock(options?: Readonly<ClockOptions>): Clock {
  return {
    scale: options?.scale ?? 1,
    paused: options?.paused ?? false,
    deltaTime: 0,
    elapsed: 0,
    parent: null,
    children: [],
    onTick: null,
  };
}

// Detaches a clock from its parent, releases its children, and drops any onTick listeners so nothing
// keeps the subtree — or the clock's subscribers — reachable through it: the parent no longer references
// this clock, each child becomes a root, and the onTick slot list is cleared. The clock is then plain
// GC-managed memory (there is no GPU or native resource to free — that would be destroy*).
export function disposeClock(clock: Clock): void {
  if (clock.parent !== null) removeClockChild(clock.parent, clock);
  const children = clock.children;
  for (let i = 0; i < children.length; i++) {
    children[i].parent = null;
  }
  children.length = 0;
  if (clock.onTick !== null) clearSignal(clock.onTick);
}

// The clock's realtime rate accounting for the hierarchy: the product of its own scale and every
// ancestor's scale. A root clock's effective scale is just its own. This is what `deltaTime` divided by
// the loop's real delta would equal (when nothing in the chain is paused).
export function getClockEffectiveScale(clock: Readonly<Clock>): number {
  let scale = clock.scale;
  let current: Readonly<Clock> | null = clock.parent;
  while (current !== null) {
    scale *= current.scale;
    current = current.parent;
  }
  return scale;
}

// The clock's parent, or null if it is a root. Convenience accessor for the `parent` field; hierarchy is
// changed through addClockChild / removeClockChild, not by assigning this.
export function getClockParent(clock: Readonly<Clock>): Clock | null {
  return clock.parent;
}

// Whether this clock receives a zero delta on the next advance: true if the clock itself or any ancestor
// is paused. A clock can be locally running yet effectively paused because a parent is paused.
export function isClockEffectivelyPaused(clock: Readonly<Clock>): boolean {
  let current: Readonly<Clock> | null = clock;
  while (current !== null) {
    if (current.paused) return true;
    current = current.parent;
  }
  return false;
}

// Pauses the clock: it and its whole subtree receive a zero delta on subsequent advances, so elapsed
// freezes until resumed. Local state — a child paused this way stays paused even if its parent resumes.
export function pauseClock(clock: Clock): void {
  clock.paused = true;
}

// Detaches `child` from `parent`, making it a root clock again. A no-op if `child` is not a child of
// `parent`.
export function removeClockChild(parent: Clock, child: Clock): void {
  const index = parent.children.indexOf(child);
  if (index === -1) return;
  parent.children.splice(index, 1);
  child.parent = null;
}

// Clears the clock's accumulated time back to the start: elapsed and deltaTime become 0. Does not touch
// scale, pause, or the hierarchy, and does not reset children (each child owns its own elapsed).
export function resetClock(clock: Clock): void {
  clock.elapsed = 0;
  clock.deltaTime = 0;
}

// Resumes a locally-paused clock. The clock still receives a zero delta while any ancestor remains
// paused (see isClockEffectivelyPaused).
export function resumeClock(clock: Clock): void {
  clock.paused = false;
}

// Sets the clock's local time scale (1 = realtime, 0.5 = half speed, 2 = double, 0 = frozen without the
// paused flag). Composes with ancestors on the next advance — see getClockEffectiveScale.
export function setClockScale(clock: Clock, scale: number): void {
  clock.scale = scale;
}
