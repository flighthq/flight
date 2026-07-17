import type { EmissiveModifier, Texture } from '@flighthq/types';
import { EmissiveModifierFacing, EmissiveModifierKind, ModifierSlot } from '@flighthq/types';

// The options for `createEmissiveModifier`. Only `color` is required; every other field carries a
// documented default so the returned descriptor is fully populated (the define-key signature reads
// `mask`/`facing` structurally, so leaving them at their defaults yields the unmasked, ungated
// program variant).
export interface EmissiveModifierOptions {
  color: number;
  strength?: number;
  mask?: Texture;
  facing?: EmissiveModifierFacing;
  facingSoftness?: number;
}

// Builds an EmissiveModifier (slot: Emissive) — a self-illuminating contribution added to the shaded
// output, optionally masked and optionally gated by surface facing (the night-side city-lights case
// uses `AwayFromLight`). `color` is packed sRgb-albedo RGBA (0xrrggbbaa); `strength` scales linear
// radiance and defaults to 1; `facing` defaults to Ignore (emit everywhere) and `facingSoftness` to
// 0 (a hard terminator). `mask` is copied by reference only when provided — omitted leaves the
// descriptor unmasked.
export function createEmissiveModifier(options: Readonly<EmissiveModifierOptions>): EmissiveModifier {
  const modifier: EmissiveModifier = {
    kind: EmissiveModifierKind,
    slot: ModifierSlot.Emissive,
    color: options.color,
    strength: options.strength ?? 1,
    facing: options.facing ?? EmissiveModifierFacing.Ignore,
    facingSoftness: options.facingSoftness ?? 0,
  };
  if (options.mask !== undefined) modifier.mask = options.mask;
  return modifier;
}
