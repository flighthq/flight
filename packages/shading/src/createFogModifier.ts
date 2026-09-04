import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { FogModifier, FogModifierOptions, EntityConstruction } from '@flighthq/types/contract';
import { FogModifierKind, FogModifierMode, ModifierSlot } from '@flighthq/types/contract';

import { initializeModifier } from './modifier';

// The options for `createFogModifier`. Only `color` is required; `mode`/`near`/`far`/`density` carry
// documented defaults. `mode` is compile-time structural (each curve emits different GLSL, so it
// drives the define-key signature); the numeric fields are uniform-fed and leave the program shape
// identical.

export function createFogModifier(options: Readonly<FogModifierOptions>): FogModifier {
  const out = allocateEntity<FogModifier>();
  initializeFogModifier(out, options);
  return finishEntity(out);
}

// Builds a FogModifier (slot: Effect) — blends the shaded output toward `color` by camera-distance
// density. `color` is packed sRgb RGBA. `mode` defaults to Linear (using `near`/`far` as the ramp
// endpoints, defaults 0 and 1); the Exponential/Exponential2 modes use `density` (default 1) as the
// falloff rate. This is the per-material forward-shaded fog term, the compiled sibling of the
// post-process ScreenSpaceFogEffect.
export function initializeFogModifier(
  out: EntityConstruction<FogModifier>,
  options: Readonly<FogModifierOptions>,
): void {
  initializeModifier(out, FogModifierKind, ModifierSlot.Effect);
  out.color = options.color;
  out.mode = options.mode ?? FogModifierMode.Linear;
  out.near = options.near ?? 0;
  out.far = options.far ?? 1;
  out.density = options.density ?? 1;
}
