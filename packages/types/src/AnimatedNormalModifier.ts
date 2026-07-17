import type { Modifier } from './Modifier';
import type { Texture } from './Texture';
import type { Vector2Like } from './Vector2';

// Perturbs the surface normal by a UV-panned normal map (slot: Normal), driven by the shading
// tier's per-frame `time` uniform so the sample offset scrolls each frame. Generalizes the globe's
// animated ocean; also covers lava and flow surfaces. `scroll` is the pan speed in UV units per
// second (a plain Vector2Like value pair, not the Vector2 entity — it carries no runtime/binding
// identity). An optional second layer (`secondaryMap` + `secondaryScroll`) pans at a different rate;
// the two perturbations combine to break up tiling repetition (the classic dual-scroll water look).
export interface AnimatedNormalModifier extends Modifier {
  kind: 'AnimatedNormalModifier';
  slot: 'Normal';
  map: Texture | null; // linear normal map panned over time; null = no perturbation
  scroll: Vector2Like;
  strength?: number; // normal perturbation scale. Default 1.
  secondaryMap?: Texture; // optional second layer for dual-scroll; omitted = single layer
  secondaryScroll?: Vector2Like; // pan speed of the second layer, used only with secondaryMap
}

export const AnimatedNormalModifierKind = 'AnimatedNormalModifier';
