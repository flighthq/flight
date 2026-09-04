import type { EntityConstruction, Modifier, ModifierKind, ModifierSlot } from '@flighthq/types/contract';

export function initializeModifier<T extends Modifier>(
  out: EntityConstruction<T>,
  kind: ModifierKind,
  slot: ModifierSlot,
): void {
  out.kind = kind;
  out.slot = slot;
}
