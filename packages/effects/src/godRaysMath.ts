import type { GodRaysEffect } from '@flighthq/types';

// God rays (light shaft / volumetric scatter) recipe math. The screen-space god rays algorithm
// (Shafts of Light, Duda/Nunnally technique) marches samples along a ray from the light source
// toward the pixel, accumulating occlusion-modulated luminance. All functions are alias-safe
// and zero-allocation (scalar return or out-param).

// Compute the total accumulation scale for the god rays pass. This is the normalization factor
// applied to the summed contributions to keep the output in a bounded range.
// Derived as: 1 / (samples * weight * exposure).
export function computeGodRaysAccumulationScale(effect: Readonly<GodRaysEffect>): number {
  const samples = Math.max(1, effect.samples ?? 100);
  const weight = Math.max(1e-6, effect.weight ?? 0.4);
  const exposure = Math.max(1e-6, effect.exposure ?? 0.1);
  return 1 / (samples * weight * exposure);
}

// Compute the light source screen-space position as a [cx, cy] pair, clamped to [0..1].
// Alias-safe.
export function computeGodRaysLightCenter(effect: Readonly<GodRaysEffect>, out: [number, number]): void {
  out[0] = Math.max(0, Math.min(1, effect.centerX ?? 0.5));
  out[1] = Math.max(0, Math.min(1, effect.centerY ?? 0.5));
}

// Compute the per-sample weight for the god rays accumulation pass. The weight decays
// geometrically by `decay` with each step, then multiplied by `weight` and `exposure`.
// Returns the contribution multiplier for sample index `i` (0-based) out of `totalSamples`.
// Used by backends to precompute sample weights for the march loop.
export function computeGodRaysSampleWeight(effect: Readonly<GodRaysEffect>, sampleIndex: number): number {
  const decay = effect.decay ?? 0.96;
  const weight = effect.weight ?? 0.4;
  const exposure = effect.exposure ?? 0.1;
  // illuminationDecay^i is the per-sample geometric decay; multiplied by weight and exposure.
  return Math.pow(decay, sampleIndex) * weight * exposure;
}

// Compute the step size (UV delta per sample) along a god rays ray from the light center
// to a screen-space point (px, py) with `samples` steps. The step is expressed as a 2-component
// UV offset [dx, dy] added to the sample position at each march step.
// density scales the effective ray length (higher density = shorter steps, thicker shafts).
// Alias-safe: computes all scalars before writing.
export function computeGodRaysStepSize(
  effect: Readonly<GodRaysEffect>,
  px: number, // pixel UV x [0..1]
  py: number, // pixel UV y [0..1]
  out: [number, number],
): void {
  const cx = effect.centerX ?? 0.5;
  const cy = effect.centerY ?? 0.5;
  const density = effect.density ?? 0.96;
  const samples = Math.max(1, effect.samples ?? 100);
  // Delta from pixel to light, scaled by density and divided by sample count.
  const dx = ((cx - px) * density) / samples;
  const dy = ((cy - py) * density) / samples;
  out[0] = dx;
  out[1] = dy;
}
