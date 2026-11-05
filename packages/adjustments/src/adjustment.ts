import type { EntityConstruction } from '@flighthq/entity/contract';

import type { Adjustment, AdjustmentKind } from './types.ts';

export function initializeAdjustment<T extends Adjustment>(out: EntityConstruction<T>, kind: AdjustmentKind): void {
  out.kind = kind;
}
