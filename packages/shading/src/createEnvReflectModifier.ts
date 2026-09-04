import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EnvReflectModifier, EnvReflectModifierOptions, EntityConstruction } from '@flighthq/types/contract';
import { EnvReflectModifierKind, ModifierSlot } from '@flighthq/types/contract';

import { initializeModifier } from './modifier';

// The options for `createEnvReflectModifier`. Every field is optional and carries a documented
// default so the returned descriptor is fully populated (all four are uniform-fed scalars, so an
// env-reflect modifier has a single define-key signature regardless of their values).

export function createEnvReflectModifier(options?: Readonly<EnvReflectModifierOptions>): EnvReflectModifier {
  const out = allocateEntity<EnvReflectModifier>();
  initializeEnvReflectModifier(out, options);
  return finishEntity(out);
}

// Builds an EnvReflectModifier (slot: Effect) — a view-dependent reflection of the scene's baked
// environment cubemap added to the shaded output. It samples the SAME prefiltered environment the lit
// block already binds (no second cubemap), reflecting the view vector about the surface normal and
// blending by a Fresnel-Schlick ramp. `tint` is packed sRgb RGBA over the sampled color and defaults
// to opaque white; `intensity` scales the whole term (default 1); `fresnelBias` is f0 (default 0.04,
// a dielectric); `roughness` selects a blurrier prefiltered mip (default 0 = mirror-sharp).
export function initializeEnvReflectModifier(
  out: EntityConstruction<EnvReflectModifier>,
  options?: Readonly<EnvReflectModifierOptions>,
): void {
  initializeModifier(out, EnvReflectModifierKind, ModifierSlot.Effect);
  out.tint = options?.tint ?? 0xffffffff;
  out.intensity = options?.intensity ?? 1;
  out.fresnelBias = options?.fresnelBias ?? 0.04;
  out.roughness = options?.roughness ?? 0;
}
