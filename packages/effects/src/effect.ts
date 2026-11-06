import type { EntityConstruction, Kind } from '@flighthq/entity/contract';

import type { Effect } from './types.ts';

export function initializeEffect<T extends Effect>(out: EntityConstruction<T>, kind: Kind): void {
  out.kind = kind;
}
