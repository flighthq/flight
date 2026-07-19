import type { EnvReflectModifier } from '@flighthq/types';
import { EnvReflectModifierKind, ModifierSlot } from '@flighthq/types';

// The options for `createEnvReflectModifier`. Every field is optional and carries a documented
// default so the returned descriptor is fully populated (all four are uniform-fed scalars, so an
// env-reflect modifier has a single define-key signature regardless of their values).
export interface EnvReflectModifierOptions {
  tint?: number;
  intensity?: number;
  fresnelBias?: number;
  roughness?: number;
}

// Builds an EnvReflectModifier (slot: Effect) — a view-dependent reflection of the scene's baked
// environment cubemap added to the shaded output. It samples the SAME prefiltered environment the lit
// block already binds (no second cubemap), reflecting the view vector about the surface normal and
// blending by a Fresnel-Schlick ramp. `tint` is packed sRgb RGBA over the sampled color and defaults
// to opaque white; `intensity` scales the whole term (default 1); `fresnelBias` is f0 (default 0.04,
// a dielectric); `roughness` selects a blurrier prefiltered mip (default 0 = mirror-sharp).
export function createEnvReflectModifier(options?: Readonly<EnvReflectModifierOptions>): EnvReflectModifier {
  return {
    kind: EnvReflectModifierKind,
    slot: ModifierSlot.Effect,
    tint: options?.tint ?? 0xffffffff,
    intensity: options?.intensity ?? 1,
    fresnelBias: options?.fresnelBias ?? 0.04,
    roughness: options?.roughness ?? 0,
  };
}
