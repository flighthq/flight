import type { Modifier, ModifierKind } from '@flighthq/types';

import type { ModifierRegistry } from './modifierRegistry';
import { resolveModifier } from './modifierRegistry';

// Returns the kinds in `stack` that have no definition in `registry` — the modifiers the compile
// path cannot assemble. An empty array is the all-clear sentinel (no throw for the expected case of
// an unknown kind). Each unregistered kind appears once, in first-seen order, so a caller can report
// exactly which vendor kind is missing its `registerModifier` call.
export function getUnregisteredModifierKinds(
  registry: Readonly<ModifierRegistry>,
  stack: readonly Modifier[],
): readonly ModifierKind[] {
  const unregistered: ModifierKind[] = [];
  for (const modifier of stack) {
    if (resolveModifier(registry, modifier.kind) !== null) continue;
    if (unregistered.includes(modifier.kind)) continue;
    unregistered.push(modifier.kind);
  }
  return unregistered;
}
