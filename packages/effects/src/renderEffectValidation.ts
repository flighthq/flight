import type { RenderEffect, RenderEffectInput } from '@flighthq/types';

import { getRenderEffectInputs } from './renderEffectInputs';

// Effect-stack validation and defaulting helpers. Pure data functions — no backend knowledge.

// Validates that an effect list's required render inputs are satisfied by the available inputs.
// Returns the first RenderEffectInput that is required but not in `available`, or `null` if the
// list is fully satisfiable.
// Sentinel-style return (never throws); ordering/composition stays in the render layer.
export function validateRenderEffectList(
  effects: readonly Readonly<RenderEffect>[],
  available: readonly RenderEffectInput[],
): RenderEffectInput | null {
  for (const effect of effects) {
    const required = getRenderEffectInputs(effect);
    for (const input of required) {
      if (!available.includes(input)) {
        return input;
      }
    }
  }
  return null;
}
