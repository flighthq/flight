// Generated from crates/flight-statechart/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  areStatechartGuardsEnabled,
  disableStatechartGuards,
  enableStatechartGuards,
} from './enableStatechartGuards.ts';
export {
  advanceStatechartInstance,
  createStatechartInstance,
  explainStatechartTransition,
  fireStatechartTrigger,
  getStatechartInputIndex,
  getStatechartRegionBlend,
  getStatechartRegionState,
  setStatechartBooleanInput,
  setStatechartNumberInput,
  setStatechartRegionDuration,
} from './statechart.ts';
export { Statechart, StatechartInstance } from './statechartCompat.ts';
export { initializeStatechartInstance } from './statechartInstanceInit.ts';
export { enableStatechartSignals, getStatechartSignals, initializeStatechartSignals } from './statechartSignals.ts';
export {
  StatechartAtomicStateKind,
  StatechartComparison,
  StatechartInputKind,
  StatechartNestedStateKind,
  StatechartTransitionStatus,
} from './types.ts';
export type {
  StatechartCondition,
  StatechartDurationGuard,
  StatechartInput,
  StatechartInstanceRaw,
  StatechartRaw,
  StatechartRegion,
  StatechartSignals,
  StatechartState,
  StatechartTransition,
  StatechartTransitionExplanation,
} from './types.ts';
