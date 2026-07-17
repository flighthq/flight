import type { RimModifier } from '@flighthq/types';
import { ModifierSlot, RimModifierKind } from '@flighthq/types';

// The options for `createRimModifier`. Only `color` is required; `power`/`intensity`/`bias` carry
// documented defaults. All three are uniform-fed scalars — they do not change the emitted program,
// so a rim modifier has a single define-key signature regardless of their values.
export interface RimModifierOptions {
  color: number;
  power?: number;
  intensity?: number;
  bias?: number;
}

// Builds a RimModifier (slot: Effect) — a view-dependent Fresnel rim added to the shaded output at
// grazing angles, following `bias + intensity * pow(1 - dot(N, V), power)`. Covers the atmospheric
// halo, force-field shields, and NPR rim light. `color` is packed sRgb-albedo RGBA (0xrrggbbaa);
// `power` (falloff exponent, higher = tighter) defaults to 3, `intensity` to 1, and `bias` (the
// constant floor before the falloff) to 0 (pure Fresnel).
export function createRimModifier(options: Readonly<RimModifierOptions>): RimModifier {
  return {
    kind: RimModifierKind,
    slot: ModifierSlot.Effect,
    color: options.color,
    power: options.power ?? 3,
    intensity: options.intensity ?? 1,
    bias: options.bias ?? 0,
  };
}
