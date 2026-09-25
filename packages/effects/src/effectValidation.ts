import type { Effect, EffectInput } from '@flighthq/types/contract';

import { getEffectInputs } from './effectInputs.ts';

// Effect-stack validation and defaulting helpers. Pure data functions — no backend knowledge.

// Validates that an effect list's required render inputs are satisfied by the available inputs.
// Returns the first EffectInput that is required but not in `available`, or `null` if the
// list is fully satisfiable.
// Sentinel-style return (never throws); ordering/composition stays in the render layer.
export function validateEffectList(
  effects: readonly Readonly<Effect>[],
  available: readonly EffectInput[],
): EffectInput | null {
  for (const effect of effects) {
    const required = getEffectInputs(effect);
    for (const input of required) {
      if (!available.includes(input)) {
        return input;
      }
    }
  }
  return null;
}
