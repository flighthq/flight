import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EmissiveModifier, EmissiveModifierOptions } from '@flighthq/types/contract';
import { EmissiveModifierFacing, EmissiveModifierKind, ModifierSlot } from '@flighthq/types/contract';

import { initializeModifier } from './modifier';

// The options for `createEmissiveModifier`. Only `color` is required; every other field carries a
// documented default so the returned descriptor is fully populated (the define-key signature reads
// `mask`/`facing` structurally, so leaving them at their defaults yields the unmasked, ungated
// program variant).

// Builds an EmissiveModifier (slot: Emissive) — a self-illuminating contribution added to the shaded
// output, optionally masked and optionally gated by surface facing (the night-side city-lights case
// uses `AwayFromLight`). `color` is packed sRgb-albedo RGBA (0xrrggbbaa); `strength` scales linear
// radiance and defaults to 1; `facing` defaults to Ignore (emit everywhere) and `facingSoftness` to
// 0 (a hard terminator). `mask` is copied by reference only when provided — omitted leaves the
// descriptor unmasked.
export function createEmissiveModifier(options: Readonly<EmissiveModifierOptions>): EmissiveModifier {
  const out = allocateEntity<EmissiveModifier>();
  initializeModifier(out, EmissiveModifierKind, ModifierSlot.Emissive);
  out.color = options.color;
  out.strength = options.strength ?? 1;
  out.facing = options.facing ?? EmissiveModifierFacing.Ignore;
  out.facingSoftness = options.facingSoftness ?? 0;
  if (options.mask !== undefined) out.mask = options.mask;
  return finishEntity(out);
}
