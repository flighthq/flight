import type { EntityConstruction } from '@flighthq/entity/contract';

import type { Modifier, ModifierKind, ModifierSlot } from './contract.shading-types.ts';

export function initializeModifier<T extends Modifier>(
  out: EntityConstruction<T>,
  kind: ModifierKind,
  slot: ModifierSlot,
): void {
  out.kind = kind;
  out.slot = slot;
}
