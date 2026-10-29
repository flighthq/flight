import type { EntityConstruction } from '@flighthq/entity/contract';

import { initializeStatechartInstancePortable } from './statechart.ts';
import type { Statechart, StatechartInstance } from './types.ts';

export function initializeStatechartInstance(
  out: EntityConstruction<StatechartInstance>,
  chart: Readonly<Statechart>,
): void {
  initializeStatechartInstancePortable(out as StatechartInstance, chart);
}
