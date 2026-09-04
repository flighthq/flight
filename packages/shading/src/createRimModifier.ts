import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { RimModifier, RimModifierOptions, EntityConstruction } from '@flighthq/types/contract';
import { ModifierSlot, RimModifierKind } from '@flighthq/types/contract';

import { initializeModifier } from './modifier';

// The options for `createRimModifier`. Only `color` is required; `power`/`intensity`/`bias` carry
// documented defaults. All three are uniform-fed scalars — they do not change the emitted program,
// so a rim modifier has a single define-key signature regardless of their values.

export function createRimModifier(options: Readonly<RimModifierOptions>): RimModifier {
  const out = allocateEntity<RimModifier>();
  initializeRimModifier(out, options);
  return finishEntity(out);
}

// Builds a RimModifier (slot: Effect) — a view-dependent Fresnel rim added to the shaded output at
// grazing angles, following `bias + intensity * pow(1 - dot(N, V), power)`. Covers the atmospheric
// halo, force-field shields, and NPR rim light. `color` is packed sRgb-albedo RGBA (0xrrggbbaa);
// `power` (falloff exponent, higher = tighter) defaults to 3, `intensity` to 1, and `bias` (the
// constant floor before the falloff) to 0 (pure Fresnel).
export function initializeRimModifier(
  out: EntityConstruction<RimModifier>,
  options: Readonly<RimModifierOptions>,
): void {
  initializeModifier(out, RimModifierKind, ModifierSlot.Effect);
  out.color = options.color;
  out.power = options.power ?? 3;
  out.intensity = options.intensity ?? 1;
  out.bias = options.bias ?? 0;
}
