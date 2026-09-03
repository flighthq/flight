import type { Entity } from './Entity';
import type { StatechartSignals } from './StatechartSignals';

// The finite input vocabulary interpreted by the statechart core. Values are numbers in an instance:
// booleans use 0/1, numbers keep their authored value, and triggers use 0/1 as an edge latch.
export const StatechartInputKind = {
  Boolean: 'Boolean',
  Number: 'Number',
  Trigger: 'Trigger',
} as const;

export type StatechartInputKind = (typeof StatechartInputKind)[keyof typeof StatechartInputKind];

// Numeric comparisons are a closed vocabulary. Trigger conditions ignore both comparison and value and
// test only whether their input's edge latch is set.
export const StatechartComparison = {
  Equal: 'Equal',
  GreaterThan: 'GreaterThan',
  GreaterThanOrEqual: 'GreaterThanOrEqual',
  LessThan: 'LessThan',
  LessThanOrEqual: 'LessThanOrEqual',
  NotEqual: 'NotEqual',
} as const;

export type StatechartComparison = (typeof StatechartComparison)[keyof typeof StatechartComparison];

// Built-in state kinds. StatechartState.kind remains an open string: custom states use vendor-prefixed
// kinds, and composition layers interpret those kinds without extending a central union.
export const StatechartAtomicStateKind = 'Statechart.Atomic';
export const StatechartNestedStateKind = 'Statechart.Nested';

// An immutable authored input shared by every instance of a chart.
export interface StatechartInput {
  initialValue: number;
  kind: StatechartInputKind;
  name?: string;
}

// One data-only guard. Every condition on a transition must hold before the transition can start.
export interface StatechartCondition {
  comparison: StatechartComparison;
  inputIndex: number;
  value: number;
}

// An authored transition. `exitTimeRatio === -1` disables the exit-time requirement. `durationMs` is
// only the blend interval the runtime reports; the statechart never samples or blends animation itself.
export interface StatechartTransition {
  conditions: readonly Readonly<StatechartCondition>[];
  durationMs: number;
  exitTimeRatio: number;
  targetStateIndex: number;
}

// The base of an open state family. `kind` is the serialization key a composition layer registers
// against; the statechart core does not close over animation, scene nodes, or user callbacks.
export interface StatechartState {
  kind: string;
  name?: string;
  transitions: readonly Readonly<StatechartTransition>[];
}

// Regions are concurrent, not covering: every instance advances every region on each explicit step.
export interface StatechartRegion {
  initialStateIndex: number;
  name?: string;
  states: readonly Readonly<StatechartState>[];
}

// Immutable, authored, shareable graph data. One chart can drive any number of mutable instances.
export interface Statechart {
  inputs: readonly Readonly<StatechartInput>[];
  name?: string;
  regions: readonly Readonly<StatechartRegion>[];
}

// Optional diagnostics hook installed by enableStatechartGuards. It lives only on the mutable instance;
// core calls it with a plain explanation and contains no log dependency or caller-facing message.
export type StatechartDurationGuard = (
  instance: Readonly<StatechartInstance>,
  explanation: Readonly<StatechartTransitionExplanation>,
) => void;

// Per-actor mutable state. The parallel numeric buffers make concurrent-region stepping allocation-free.
// `regionTransitions` holds the active transition index in the current state's transition list, or -1.
// `regionElapsed` and `regionDuration` use the caller's `deltaTime` unit; the composition layer sets a
// state's denominator via setStatechartRegionDuration without the statechart knowing what produced it.
// Both reset whenever a region reaches a new state. Optional diagnostics/observers are actor-local and
// never enter immutable authored data.
export interface StatechartInstance extends Entity {
  readonly chart: Readonly<Statechart>;
  durationGuard: StatechartDurationGuard | null;
  readonly inputValues: Float64Array;
  readonly regionBlend: Float32Array;
  readonly regionDuration: Float64Array;
  readonly regionElapsed: Float64Array;
  readonly regionStates: Int32Array;
  readonly regionTransitions: Int32Array;
  signals: StatechartSignals | null;
}

// Pure diagnostic for the zero-change/sentinel path of advanceStatechartInstance. Indices are -1 when
// the named object does not exist for the reported status.
export const StatechartTransitionStatus = {
  ConditionsUnmet: 'ConditionsUnmet',
  ExitTimePending: 'ExitTimePending',
  InvalidRegion: 'InvalidRegion',
  MissingRegionDuration: 'MissingRegionDuration',
  NoTransitions: 'NoTransitions',
  Ready: 'Ready',
  Transitioning: 'Transitioning',
} as const;

export type StatechartTransitionStatus = (typeof StatechartTransitionStatus)[keyof typeof StatechartTransitionStatus];

export interface StatechartTransitionExplanation {
  blend: number;
  conditionIndex: number;
  regionIndex: number;
  sourceStateIndex: number;
  status: StatechartTransitionStatus;
  targetStateIndex: number;
  transitionIndex: number;
}
