import type { EntityConstruction, Kind, Effect } from '@flighthq/types/contract';

export function initializeEffect<T extends Effect>(out: EntityConstruction<T>, kind: Kind): void {
  out.kind = kind;
}
