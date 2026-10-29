import type { EntityConstruction } from '@flighthq/entity/contract';

import { initializeStatechartInstancePortable } from './statechart.ts';
import type { StatechartInstanceRaw, StatechartRaw } from './types.ts';

export function initializeStatechartInstance(
  out: EntityConstruction<StatechartInstanceRaw>,
  chart: Readonly<StatechartRaw>,
): void {
  initializeStatechartInstancePortable(out as StatechartInstanceRaw, chart);
}
