import type { Modifier } from './Modifier';

// Adds an environment (skybox / IBL cubemap) reflection to the shaded output (slot: Effect): the
// view vector is reflected about the surface normal, the scene's prefiltered environment cubemap is
// sampled along it, and the result is blended into the shaded radiance. Generalizes chrome / water /
// glass reflections and the classic "shiny sphere mirrors the sky" look — a view-dependent term over
// the SAME baked environment the lit block already binds (no second cubemap upload), so a scene with
// an environment set gets reflections for free and one without falls back to the reflection tint.
//
// The reflection factor follows a Fresnel-Schlick ramp: `fresnel = f0 + (1 - f0) * pow(1 - dot(N, V),
// 5)`, so grazing angles reflect more (like a real dielectric); `intensity` scales the whole term and
// `tint` multiplies the sampled color (packed sRgb RGBA). `roughness` selects a blurrier prefiltered
// mip (0 = mirror, 1 = fully diffuse), matching the environment's roughness-mipped chain.
export interface EnvReflectModifier extends Modifier {
  kind: 'EnvReflectModifier';
  slot: 'Effect';
  tint: number; // packed sRgb RGBA multiplier over the sampled reflection. Default 0xffffffff.
  intensity?: number; // overall reflection strength. Default 1.
  fresnelBias?: number; // Fresnel f0 — reflectance at normal incidence. Default 0.04 (dielectric).
  roughness?: number; // 0 = mirror-sharp, 1 = fully blurred prefiltered mip. Default 0.
}

export const EnvReflectModifierKind = 'EnvReflectModifier';
