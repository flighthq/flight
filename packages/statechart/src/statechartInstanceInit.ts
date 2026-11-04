// Generated from crates/flight-statechart/src/statechart_instance_init.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { EntityConstruction } from '@flighthq/entity/contract';

import { initializeStatechartInstancePortable } from './statechart.ts';
import type { StatechartInstanceRaw, StatechartRaw } from './types.ts';

export function initializeStatechartInstance(
  out: EntityConstruction<StatechartInstanceRaw>,
  chart: StatechartRaw,
): void {
  initializeStatechartInstancePortable(out, chart);
}
