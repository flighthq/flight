// Generated from crates/flight-statechart/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  StatechartAtomicStateKind,
  StatechartComparison,
  StatechartInputKind,
  StatechartNestedStateKind,
  StatechartTransitionStatus,
  advanceStatechartInstance,
  areStatechartGuardsEnabled,
  createStatechartInstance,
  disableStatechartGuards,
  enableStatechartGuards,
  enableStatechartSignals,
  explainStatechartTransition,
  fireStatechartTrigger,
  getStatechartInputIndex,
  getStatechartRegionBlend,
  getStatechartRegionState,
  getStatechartSignals,
  setStatechartBooleanInput,
  setStatechartNumberInput,
  setStatechartRegionDuration,
} from './contract.ts';

export type {
  Statechart,
  StatechartCondition,
  StatechartDurationGuard,
  StatechartInput,
  StatechartInstance,
  StatechartRegion,
  StatechartSignals,
  StatechartState,
  StatechartTransition,
  StatechartTransitionExplanation,
} from './contract.ts';
