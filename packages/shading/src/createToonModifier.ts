import type { ToonModifier } from '@flighthq/types';
import { ModifierSlot, ToonModifierKind } from '@flighthq/types';

// The options for `createToonModifier`. Only `steps` is required; `smoothness` carries a documented
// default. Both are uniform-fed scalars — they do not change the emitted program, so a toon modifier
// has a single define-key signature regardless of their values.
export interface ToonModifierOptions {
  steps: number;
  smoothness?: number;
}

// Builds a ToonModifier (slot: Effect) — quantizes the shaded radiance into `steps` flat cel bands,
// producing the hard light/shadow terminator of toon shading as a MODIFIER over the ShadedMaterial
// base (the compiled sibling of the standalone ToonMaterial, so a toon look stacks with emissive/rim/
// fog). `steps` is the number of shading bands (values below 2 clamp to 2 in the shader); `smoothness`
// softens each band edge and defaults to 0 (crisp cel edges).
export function createToonModifier(options: Readonly<ToonModifierOptions>): ToonModifier {
  return {
    kind: ToonModifierKind,
    slot: ModifierSlot.Effect,
    steps: options.steps,
    smoothness: options.smoothness ?? 0,
  };
}
