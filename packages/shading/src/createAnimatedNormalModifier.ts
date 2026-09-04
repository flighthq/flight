import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AnimatedNormalModifier,
  AnimatedNormalModifierOptions,
  EntityConstruction,
} from '@flighthq/types/contract';
import { AnimatedNormalModifierKind, ModifierSlot } from '@flighthq/types/contract';

import { initializeModifier } from './modifier';

// The options for `createAnimatedNormalModifier`. `map` (nullable) and `scroll` are required; the
// optional second layer and `strength` carry documented defaults. `map` presence and `secondaryMap`
// presence are compile-time structural — they drive the define-key signature (disabled / single /
// dual) — while `scroll`/`strength` are uniform-fed.

export function createAnimatedNormalModifier(options: Readonly<AnimatedNormalModifierOptions>): AnimatedNormalModifier {
  const out = allocateEntity<AnimatedNormalModifier>();
  initializeAnimatedNormalModifier(out, options);
  return finishEntity(out);
}

// Builds an AnimatedNormalModifier (slot: Normal) — a UV-panned normal map that perturbs the surface
// normal, scrolled by the shading tier's per-frame `time` uniform. Covers animated water, lava, and
// flow. `scroll` is the pan speed in UV units per second (a plain Vector2Like value, copied by
// reference); `strength` defaults to 1. An optional `secondaryMap` (+ `secondaryScroll`) adds a
// second layer panning at a different rate to break up tiling — omitted leaves the modifier a single
// layer.
export function initializeAnimatedNormalModifier(
  out: EntityConstruction<AnimatedNormalModifier>,
  options: Readonly<AnimatedNormalModifierOptions>,
): void {
  initializeModifier(out, AnimatedNormalModifierKind, ModifierSlot.Normal);
  out.map = options.map;
  out.scroll = options.scroll;
  out.strength = options.strength ?? 1;
  if (options.secondaryMap !== undefined) out.secondaryMap = options.secondaryMap;
  if (options.secondaryScroll !== undefined) out.secondaryScroll = options.secondaryScroll;
}
