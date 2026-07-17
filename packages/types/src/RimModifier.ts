import type { Modifier } from './Modifier';

// Adds a view-dependent Fresnel rim to the shaded output (slot: Effect): an additive glow at
// grazing angles where the surface normal turns away from the view direction. Generalizes the
// globe's atmospheric halo, and also covers force-field shields and NPR rim light. The rim factor
// follows `bias + intensity * pow(1 - dot(N, V), power)`, clamped, then adds `color` scaled by that
// factor. `color` is packed sRgb-albedo RGBA (0xrrggbbaa); higher `power` tightens the rim to the
// silhouette.
export interface RimModifier extends Modifier {
  kind: 'RimModifier';
  slot: 'Effect';
  color: number;
  power?: number; // Fresnel falloff exponent, higher = tighter rim. Default 3.
  intensity?: number; // additive strength of the rim. Default 1.
  bias?: number; // constant floor added before the falloff, 0 = pure Fresnel. Default 0.
}

export const RimModifierKind = 'RimModifier';
