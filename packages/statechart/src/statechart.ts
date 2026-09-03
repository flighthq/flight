import { createEntity } from '@flighthq/entity/contract';
import { StatechartComparison, StatechartInputKind, StatechartTransitionStatus } from '@flighthq/types/contract';
import type {
  Statechart,
  StatechartCondition,
  StatechartInstance,
  StatechartTransition,
  StatechartTransitionExplanation,
} from '@flighthq/types/contract';

// Advance every concurrent region by `deltaTime` milliseconds and return how many reached a new
// state. Each region changes at most once per call. Trigger inputs are edge latches shared by all
// regions for the whole pass, then cleared, so one fired trigger can independently drive several
// regions. Blend progress is reported as a number only; this package never samples or blends content.
export function advanceStatechartInstance(instance: StatechartInstance, deltaTime: number): number {
  const deltaTimeMs = Number.isFinite(deltaTime) && deltaTime > 0 ? deltaTime : 0;
  let changedRegions: number[] | null = null;
  let changedRegionCount = 0;

  for (let regionIndex = 0; regionIndex < instance.chart.regions.length; regionIndex++) {
    const previousStateIndex = instance.regionStates[regionIndex];
    if (advanceStatechartRegion(instance, regionIndex, deltaTimeMs)) {
      changedRegionCount++;
      // Observer allocation is opt-in and occurs only when a state actually changes. Pairs are
      // [regionIndex, previousStateIndex]; the new state is already in regionStates.
      if (instance.signals !== null) (changedRegions ??= []).push(regionIndex, previousStateIndex);
    }
  }

  // Clear before emitting: a listener may fire a trigger for the NEXT pass, and that edge must not be
  // erased by cleanup from this pass. Deferring every emit also prevents a region-0 listener from
  // mutating an input while later concurrent regions are still evaluating the shared input snapshot.
  clearStatechartTriggers(instance);
  if (changedRegions !== null && instance.signals !== null) {
    for (let i = 0; i < changedRegions.length; i += 2) {
      const regionIndex = changedRegions[i];
      instance.signals.onStateChange.emit(regionIndex, changedRegions[i + 1], instance.regionStates[regionIndex]);
    }
  }
  return changedRegionCount;
}

// Allocate the mutable per-actor half of `chart`. The chart itself is retained by reference and is
// never mutated; input and region state live in independent typed arrays so one chart can drive many
// actors. Malformed authored indices/kinds are programmer errors and fail at this construction seam.
export function createStatechartInstance(chart: Readonly<Statechart>): StatechartInstance {
  validateStatechart(chart);

  const inputValues = new Float64Array(chart.inputs.length);
  for (let inputIndex = 0; inputIndex < chart.inputs.length; inputIndex++) {
    const input = chart.inputs[inputIndex];
    inputValues[inputIndex] =
      input.kind === StatechartInputKind.Boolean ? (input.initialValue === 0 ? 0 : 1) : input.initialValue;
  }

  const regionCount = chart.regions.length;
  const regionBlend = new Float32Array(regionCount);
  const regionDuration = new Float64Array(regionCount);
  const regionElapsed = new Float64Array(regionCount);
  const regionStates = new Int32Array(regionCount);
  const regionTransitions = new Int32Array(regionCount);
  regionTransitions.fill(-1);

  for (let regionIndex = 0; regionIndex < regionCount; regionIndex++) {
    regionStates[regionIndex] = chart.regions[regionIndex].initialStateIndex;
  }

  return createEntity({
    chart,
    durationGuard: null,
    inputValues,
    regionBlend,
    regionDuration,
    regionElapsed,
    regionStates,
    regionTransitions,
    signals: null,
  });
}

// Explain what the next advance sees in one region. This is the shakeable diagnostic companion to
// sentinel/count-based runtime calls: it reports an active blend, the first ready transition, or the
// first authored transition's blocking condition/exit time without mutating the instance.
export function explainStatechartTransition(
  instance: Readonly<StatechartInstance>,
  regionIndex: number,
): StatechartTransitionExplanation {
  const region = instance.chart.regions[regionIndex];
  if (region === undefined) return invalidRegionExplanation(regionIndex);

  const sourceStateIndex = instance.regionStates[regionIndex];
  const state = region.states[sourceStateIndex];
  if (state === undefined) return invalidRegionExplanation(regionIndex);

  const activeTransitionIndex = instance.regionTransitions[regionIndex];
  if (activeTransitionIndex >= 0) {
    const activeTransition = state.transitions[activeTransitionIndex];
    if (activeTransition === undefined) return invalidRegionExplanation(regionIndex);
    return {
      blend: instance.regionBlend[regionIndex],
      conditionIndex: -1,
      regionIndex,
      sourceStateIndex,
      status: StatechartTransitionStatus.Transitioning,
      targetStateIndex: activeTransition.targetStateIndex,
      transitionIndex: activeTransitionIndex,
    };
  }

  if (state.transitions.length === 0) {
    return {
      blend: 0,
      conditionIndex: -1,
      regionIndex,
      sourceStateIndex,
      status: StatechartTransitionStatus.NoTransitions,
      targetStateIndex: -1,
      transitionIndex: -1,
    };
  }

  let firstBlocked: StatechartTransitionExplanation | null = null;
  for (let transitionIndex = 0; transitionIndex < state.transitions.length; transitionIndex++) {
    const transition = state.transitions[transitionIndex];
    const conditionIndex = getFirstUnmetCondition(instance, transition);
    if (conditionIndex >= 0) {
      firstBlocked ??= {
        blend: 0,
        conditionIndex,
        regionIndex,
        sourceStateIndex,
        status: StatechartTransitionStatus.ConditionsUnmet,
        targetStateIndex: transition.targetStateIndex,
        transitionIndex,
      };
      continue;
    }
    const exitStatus = getStatechartExitStatus(instance, regionIndex, transition);
    if (exitStatus === StatechartTransitionStatus.MissingRegionDuration) {
      return {
        blend: 0,
        conditionIndex: -1,
        regionIndex,
        sourceStateIndex,
        status: StatechartTransitionStatus.MissingRegionDuration,
        targetStateIndex: transition.targetStateIndex,
        transitionIndex,
      };
    }
    if (exitStatus === StatechartTransitionStatus.ExitTimePending) {
      firstBlocked ??= {
        blend: 0,
        conditionIndex: -1,
        regionIndex,
        sourceStateIndex,
        status: StatechartTransitionStatus.ExitTimePending,
        targetStateIndex: transition.targetStateIndex,
        transitionIndex,
      };
      continue;
    }
    return {
      blend: 0,
      conditionIndex: -1,
      regionIndex,
      sourceStateIndex,
      status: StatechartTransitionStatus.Ready,
      targetStateIndex: transition.targetStateIndex,
      transitionIndex,
    };
  }

  return firstBlocked as StatechartTransitionExplanation;
}

// Latch a Trigger input for the next whole-region advance. Trigger conditions ignore their authored
// comparison/value and test only this latch. Invalid indices and kind mismatches are programmer errors.
export function fireStatechartTrigger(instance: StatechartInstance, inputIndex: number): void {
  assertStatechartInputKind(instance, inputIndex, StatechartInputKind.Trigger);
  instance.inputValues[inputIndex] = 1;
}

// Return the first input with `name`, or -1 when it is absent. Authored duplicate names deliberately
// preserve array/serialization order rather than building hidden lookup state.
export function getStatechartInputIndex(chart: Readonly<Statechart>, name: string): number {
  for (let inputIndex = 0; inputIndex < chart.inputs.length; inputIndex++) {
    if (chart.inputs[inputIndex].name === name) return inputIndex;
  }
  return -1;
}

// Return one concurrent region's target-state blend weight in [0, 1], or -1 for an invalid region.
// The composition layer decides what the plain number means; statechart performs no animation work.
export function getStatechartRegionBlend(instance: Readonly<StatechartInstance>, regionIndex: number): number {
  return regionIndex >= 0 && regionIndex < instance.regionBlend.length ? instance.regionBlend[regionIndex] : -1;
}

// Return one concurrent region's current source-state index, or -1 for an invalid region.
export function getStatechartRegionState(instance: Readonly<StatechartInstance>, regionIndex: number): number {
  return regionIndex >= 0 && regionIndex < instance.regionStates.length ? instance.regionStates[regionIndex] : -1;
}

// Write a Boolean input as the numeric 0/1 vocabulary used by data-only transition conditions.
export function setStatechartBooleanInput(instance: StatechartInstance, inputIndex: number, value: boolean): void {
  assertStatechartInputKind(instance, inputIndex, StatechartInputKind.Boolean);
  instance.inputValues[inputIndex] = value ? 1 : 0;
}

// Write a Number input. Numbers remain exact authored/runtime values; comparisons happen only while
// selecting a transition.
export function setStatechartNumberInput(instance: StatechartInstance, inputIndex: number, value: number): void {
  assertStatechartInputKind(instance, inputIndex, StatechartInputKind.Number);
  instance.inputValues[inputIndex] = value;
}

// Supply the current state's duration for exit-time evaluation, in the same millisecond unit as
// advanceStatechartInstance. The composition layer owns what the duration means and where it came from;
// statechart only divides elapsed time by this plain number. Zero explicitly marks duration unavailable.
export function setStatechartRegionDuration(instance: StatechartInstance, regionIndex: number, duration: number): void {
  if (!Number.isInteger(regionIndex) || regionIndex < 0 || regionIndex >= instance.regionDuration.length) {
    throw new RangeError(`Statechart region index ${regionIndex} is out of range`);
  }
  if (!Number.isFinite(duration) || duration < 0) {
    throw new RangeError('Statechart region duration must be finite and non-negative');
  }
  instance.regionDuration[regionIndex] = duration;
}

function advanceStatechartRegion(instance: StatechartInstance, regionIndex: number, deltaTimeMs: number): boolean {
  const region = instance.chart.regions[regionIndex];
  const sourceStateIndex = instance.regionStates[regionIndex];
  const sourceState = region.states[sourceStateIndex];
  if (sourceState === undefined) throw new RangeError(`Statechart region ${regionIndex} has an invalid active state`);
  instance.regionElapsed[regionIndex] += deltaTimeMs;

  let transitionIndex = instance.regionTransitions[regionIndex];
  let transition: Readonly<StatechartTransition> | undefined;
  if (transitionIndex >= 0) {
    transition = sourceState.transitions[transitionIndex];
    if (transition === undefined) {
      throw new RangeError(`Statechart region ${regionIndex} has an invalid active transition`);
    }
  } else {
    transitionIndex = getReadyTransitionIndex(instance, regionIndex);
    if (transitionIndex < 0) return false;
    transition = sourceState.transitions[transitionIndex];
    instance.regionTransitions[regionIndex] = transitionIndex;
    instance.regionBlend[regionIndex] = 0;
  }

  const durationMs = Number.isFinite(transition.durationMs) && transition.durationMs > 0 ? transition.durationMs : 0;
  const blend = durationMs === 0 ? 1 : Math.min(1, instance.regionBlend[regionIndex] + deltaTimeMs / durationMs);
  instance.regionBlend[regionIndex] = blend;
  if (blend < 1) return false;

  instance.regionStates[regionIndex] = transition.targetStateIndex;
  instance.regionTransitions[regionIndex] = -1;
  instance.regionBlend[regionIndex] = 0;
  instance.regionDuration[regionIndex] = 0;
  instance.regionElapsed[regionIndex] = 0;
  return true;
}

function assertStatechartInputKind(
  instance: Readonly<StatechartInstance>,
  inputIndex: number,
  expectedKind: (typeof StatechartInputKind)[keyof typeof StatechartInputKind],
): void {
  const input = instance.chart.inputs[inputIndex];
  if (input === undefined) throw new RangeError(`Statechart input index ${inputIndex} is out of range`);
  if (input.kind !== expectedKind) {
    throw new TypeError(`Statechart input ${inputIndex} is ${input.kind}, not ${expectedKind}`);
  }
}

function clearStatechartTriggers(instance: StatechartInstance): void {
  for (let inputIndex = 0; inputIndex < instance.chart.inputs.length; inputIndex++) {
    if (instance.chart.inputs[inputIndex].kind === StatechartInputKind.Trigger) instance.inputValues[inputIndex] = 0;
  }
}

function compareStatechartCondition(value: number, condition: Readonly<StatechartCondition>): boolean {
  switch (condition.comparison) {
    case StatechartComparison.Equal:
      return value === condition.value;
    case StatechartComparison.GreaterThan:
      return value > condition.value;
    case StatechartComparison.GreaterThanOrEqual:
      return value >= condition.value;
    case StatechartComparison.LessThan:
      return value < condition.value;
    case StatechartComparison.LessThanOrEqual:
      return value <= condition.value;
    case StatechartComparison.NotEqual:
      return value !== condition.value;
  }
}

function getFirstUnmetCondition(
  instance: Readonly<StatechartInstance>,
  transition: Readonly<StatechartTransition>,
): number {
  for (let conditionIndex = 0; conditionIndex < transition.conditions.length; conditionIndex++) {
    const condition = transition.conditions[conditionIndex];
    const input = instance.chart.inputs[condition.inputIndex];
    if (input === undefined) return conditionIndex;
    const inputValue = instance.inputValues[condition.inputIndex];
    const met =
      input.kind === StatechartInputKind.Trigger ? inputValue !== 0 : compareStatechartCondition(inputValue, condition);
    if (!met) return conditionIndex;
  }
  return -1;
}

function getReadyTransitionIndex(instance: Readonly<StatechartInstance>, regionIndex: number): number {
  const region = instance.chart.regions[regionIndex];
  const state = region.states[instance.regionStates[regionIndex]];
  for (let transitionIndex = 0; transitionIndex < state.transitions.length; transitionIndex++) {
    const transition = state.transitions[transitionIndex];
    if (getFirstUnmetCondition(instance, transition) >= 0) continue;
    const exitStatus = getStatechartExitStatus(instance, regionIndex, transition);
    if (exitStatus === StatechartTransitionStatus.ExitTimePending) continue;
    if (exitStatus === StatechartTransitionStatus.MissingRegionDuration) {
      instance.durationGuard?.(instance, {
        blend: 0,
        conditionIndex: -1,
        regionIndex,
        sourceStateIndex: instance.regionStates[regionIndex],
        status: StatechartTransitionStatus.MissingRegionDuration,
        targetStateIndex: transition.targetStateIndex,
        transitionIndex,
      });
    }
    return transitionIndex;
  }
  return -1;
}

function getStatechartExitStatus(
  instance: Readonly<StatechartInstance>,
  regionIndex: number,
  transition: Readonly<StatechartTransition>,
):
  | typeof StatechartTransitionStatus.ExitTimePending
  | typeof StatechartTransitionStatus.MissingRegionDuration
  | typeof StatechartTransitionStatus.Ready {
  if (transition.exitTimeRatio < 0) return StatechartTransitionStatus.Ready;
  const duration = instance.regionDuration[regionIndex];
  if (duration <= 0) return StatechartTransitionStatus.MissingRegionDuration;
  return instance.regionElapsed[regionIndex] / duration >= transition.exitTimeRatio
    ? StatechartTransitionStatus.Ready
    : StatechartTransitionStatus.ExitTimePending;
}

function invalidRegionExplanation(regionIndex: number): StatechartTransitionExplanation {
  return {
    blend: -1,
    conditionIndex: -1,
    regionIndex,
    sourceStateIndex: -1,
    status: StatechartTransitionStatus.InvalidRegion,
    targetStateIndex: -1,
    transitionIndex: -1,
  };
}

function validateStatechart(chart: Readonly<Statechart>): void {
  for (let inputIndex = 0; inputIndex < chart.inputs.length; inputIndex++) {
    const kind = chart.inputs[inputIndex].kind;
    if (
      kind !== StatechartInputKind.Boolean &&
      kind !== StatechartInputKind.Number &&
      kind !== StatechartInputKind.Trigger
    ) {
      throw new TypeError(`Statechart input ${inputIndex} has unknown kind ${String(kind)}`);
    }
  }

  for (let regionIndex = 0; regionIndex < chart.regions.length; regionIndex++) {
    const region = chart.regions[regionIndex];
    if (region.initialStateIndex < 0 || region.initialStateIndex >= region.states.length) {
      throw new RangeError(`Statechart region ${regionIndex} has an invalid initialStateIndex`);
    }
    for (let stateIndex = 0; stateIndex < region.states.length; stateIndex++) {
      const state = region.states[stateIndex];
      if (typeof state.kind !== 'string' || state.kind.length === 0) {
        throw new TypeError(`Statechart region ${regionIndex} state ${stateIndex} has an invalid kind`);
      }
      for (let transitionIndex = 0; transitionIndex < state.transitions.length; transitionIndex++) {
        const transition = state.transitions[transitionIndex];
        if (!Number.isFinite(transition.durationMs) || transition.durationMs < 0) {
          throw new RangeError(
            `Statechart region ${regionIndex} state ${stateIndex} transition ${transitionIndex} has an invalid duration`,
          );
        }
        if (!Number.isFinite(transition.exitTimeRatio) || transition.exitTimeRatio < -1) {
          throw new RangeError(
            `Statechart region ${regionIndex} state ${stateIndex} transition ${transitionIndex} has an invalid exit time`,
          );
        }
        if (transition.targetStateIndex < 0 || transition.targetStateIndex >= region.states.length) {
          throw new RangeError(
            `Statechart region ${regionIndex} state ${stateIndex} transition ${transitionIndex} has an invalid target`,
          );
        }
        for (let conditionIndex = 0; conditionIndex < transition.conditions.length; conditionIndex++) {
          const condition = transition.conditions[conditionIndex];
          const inputIndex = condition.inputIndex;
          if (!Number.isInteger(inputIndex) || inputIndex < 0 || inputIndex >= chart.inputs.length) {
            throw new RangeError(
              `Statechart region ${regionIndex} state ${stateIndex} transition ${transitionIndex} has an invalid input`,
            );
          }
          if (!Object.values(StatechartComparison).includes(condition.comparison)) {
            throw new TypeError(
              `Statechart region ${regionIndex} state ${stateIndex} transition ${transitionIndex} has an invalid comparison`,
            );
          }
        }
      }
    }
  }
}
