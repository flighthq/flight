import type { Adjustment, AdjustmentKind, EntityConstruction } from '@flighthq/types/contract';

export function initializeAdjustment<T extends Adjustment>(out: EntityConstruction<T>, kind: AdjustmentKind): void {
  out.kind = kind;
}
