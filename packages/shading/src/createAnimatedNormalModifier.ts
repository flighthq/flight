import type { AnimatedNormalModifier, Texture, Vector2Like } from '@flighthq/types';
import { AnimatedNormalModifierKind, ModifierSlot } from '@flighthq/types';

// The options for `createAnimatedNormalModifier`. `map` (nullable) and `scroll` are required; the
// optional second layer and `strength` carry documented defaults. `map` presence and `secondaryMap`
// presence are compile-time structural — they drive the define-key signature (disabled / single /
// dual) — while `scroll`/`strength` are uniform-fed.
export interface AnimatedNormalModifierOptions {
  map: Texture | null;
  scroll: Vector2Like;
  strength?: number;
  secondaryMap?: Texture;
  secondaryScroll?: Vector2Like;
}

// Builds an AnimatedNormalModifier (slot: Normal) — a UV-panned normal map that perturbs the surface
// normal, scrolled by the shading tier's per-frame `time` uniform. Covers animated water, lava, and
// flow. `scroll` is the pan speed in UV units per second (a plain Vector2Like value, copied by
// reference); `strength` defaults to 1. An optional `secondaryMap` (+ `secondaryScroll`) adds a
// second layer panning at a different rate to break up tiling — omitted leaves the modifier a single
// layer.
export function createAnimatedNormalModifier(options: Readonly<AnimatedNormalModifierOptions>): AnimatedNormalModifier {
  const modifier: AnimatedNormalModifier = {
    kind: AnimatedNormalModifierKind,
    slot: ModifierSlot.Normal,
    map: options.map,
    scroll: options.scroll,
    strength: options.strength ?? 1,
  };
  if (options.secondaryMap !== undefined) modifier.secondaryMap = options.secondaryMap;
  if (options.secondaryScroll !== undefined) modifier.secondaryScroll = options.secondaryScroll;
  return modifier;
}
