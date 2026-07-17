import type { Modifier } from '@flighthq/types';

import { getUnregisteredModifierKinds } from './getUnregisteredModifierKinds';
import type { ModifierRegistry } from './modifierRegistry';

// Returns true when every modifier in `stack` has a definition in `registry` — the boolean the
// compile path checks before assembling a program. An empty stack is valid (it compiles to the bare
// base). The plain-data companion is `getUnregisteredModifierKinds`, which names which kinds fail.
export function isModifierStackValid(registry: Readonly<ModifierRegistry>, stack: readonly Modifier[]): boolean {
  return getUnregisteredModifierKinds(registry, stack).length === 0;
}
