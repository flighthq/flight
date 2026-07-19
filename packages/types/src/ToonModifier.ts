import type { Modifier } from './Modifier';

// Quantizes the shaded radiance into flat cel bands (slot: Effect): the luminance of the shaded
// output is snapped to one of `steps` discrete levels and the radiance is rescaled to that quantized
// luminance, producing the hard light/shadow terminator of cel / toon shading. Generalizes the NPR
// cartoon look as a MODIFIER over the ShadedMaterial base — the compiled sibling of the standalone
// `ToonMaterial`, letting a toon look stack with emissive/rim/fog on one surface rather than forking
// a whole material. `steps` is the number of shading bands (2 = a hard two-tone terminator); a higher
// `smoothness` softens each band edge from a hard step toward a smooth ramp (0 = crisp cel edges).
export interface ToonModifier extends Modifier {
  kind: 'ToonModifier';
  slot: 'Effect';
  steps: number; // number of discrete shading bands; 2 = two-tone. Values below 2 clamp to 2.
  smoothness?: number; // band-edge softness, 0 = hard cel step, higher = smoother ramp. Default 0.
}

export const ToonModifierKind = 'ToonModifier';
