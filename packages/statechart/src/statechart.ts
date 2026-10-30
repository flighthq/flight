// Generated from crates/flight-statechart/src/statechart.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';

import { initializeStatechartInstanceFields } from './statechartInstanceFields.ts';
import {
  isStatechartComparison,
  isStatechartInteger,
  isStatechartString,
  throwStatechartInputKindTypeError,
  throwStatechartTypeError,
  throwStatechartUnknownInputKindTypeError,
} from './statechartRuntime.ts';
import { emitStatechartStateChange } from './statechartSignalEmit.ts';
import {
  createStatechartFloat32Array,
  createStatechartFloat64Array,
  createStatechartInt32Array,
} from './statechartTypedArrays.ts';
import type {
  StatechartCondition,
  StatechartInputKind,
  StatechartInstanceRaw,
  StatechartRaw,
  StatechartTransition,
  StatechartTransitionExplanation,
  StatechartTransitionStatus,
} from './types.ts';

export function advanceStatechartInstance(instance: StatechartInstanceRaw, deltaTime: number): number {
  const deltaTimeMs = Number.isFinite(deltaTime) && deltaTime > 0.0 ? deltaTime : 0.0;
  const chart = instance!.chart;
  const regionCount = chart!.regions.length;
  let changed: number[] | null = null;
  let changedCount = 0;
  for (let regionIndex = 0; regionIndex < regionCount; regionIndex += 1) {
    const previousStateIndex = instance!.regionStates[regionIndex];
    if (advanceStatechartRegion(instance, chart, regionIndex | 0, deltaTimeMs)) {
      changedCount += 1;
      if (instance!.signals !== null) {
        if (changed === null) {
          changed = [] as never[];
        }
        const activeChanged = changed!;
        activeChanged.push(regionIndex | 0);
        activeChanged.push(previousStateIndex);
      }
    }
  }
  clearStatechartTriggers(instance, chart);
  const signals = instance!.signals;
  if (signals !== null) {
    const activeSignals = signals;
    if (changed !== null) {
      const activeChanged = changed;
      let changedIndex = 0;
      while (changedIndex < activeChanged.length) {
        const regionIndex = activeChanged[changedIndex];
        const previousStateIndex = activeChanged[changedIndex + 1];
        const newStateIndex = instance!.regionStates[regionIndex >>> 0];
        emitStatechartStateChange(activeSignals, regionIndex, previousStateIndex, newStateIndex);
        changedIndex += 2;
      }
    }
  }
  return changedCount;
}

export function createStatechartInstance(chart: StatechartRaw): StatechartInstanceRaw {
  let out: StatechartInstanceRaw = allocateEntity<StatechartInstanceRaw>();
  initializeStatechartInstancePortable(out, chart);
  return out;
}

export function explainStatechartTransition(
  instance: StatechartInstanceRaw,
  regionIndex: number,
): StatechartTransitionExplanation {
  if (!isStatechartInteger(regionIndex) || regionIndex < 0) {
    return invalidRegionExplanation(regionIndex);
  }
  const ri = regionIndex >>> 0;
  let chart = instance!.chart;
  chart = chart!;
  if (ri >= chart.regions.length) {
    return invalidRegionExplanation(regionIndex);
  }
  const region = chart.regions[ri];
  const sourceStateIndex = instance!.regionStates[ri];
  if (sourceStateIndex < 0 || sourceStateIndex >>> 0 >= region.states.length) {
    return invalidRegionExplanation(regionIndex);
  }
  const state = region.states[sourceStateIndex >>> 0];
  const activeTransitionIndex = instance!.regionTransitions[ri];
  if (activeTransitionIndex >= 0) {
    if (activeTransitionIndex >>> 0 >= state.transitions.length) {
      return invalidRegionExplanation(regionIndex);
    }
    const active = state.transitions[activeTransitionIndex >>> 0];
    return {
      blend: instance!.regionBlend[ri],
      conditionIndex: -1,
      regionIndex: regionIndex,
      sourceStateIndex: sourceStateIndex,
      status: 'Transitioning',
      targetStateIndex: active.targetStateIndex,
      transitionIndex: activeTransitionIndex,
    };
  }
  if (state.transitions.length === 0) {
    return {
      blend: 0.0,
      conditionIndex: -1,
      regionIndex: regionIndex,
      sourceStateIndex: sourceStateIndex,
      status: 'NoTransitions',
      targetStateIndex: -1,
      transitionIndex: -1,
    };
  }
  let firstBlocked: StatechartTransitionExplanation | null = null;
  for (let transitionIndex = 0; transitionIndex < state.transitions.length; transitionIndex += 1) {
    const transition = state.transitions[transitionIndex];
    const conditionIndex = getFirstUnmetCondition(instance, chart, transition);
    if (conditionIndex >= 0) {
      if (firstBlocked === null) {
        firstBlocked = {
          blend: 0.0,
          conditionIndex: conditionIndex,
          regionIndex: regionIndex,
          sourceStateIndex: sourceStateIndex,
          status: 'ConditionsUnmet',
          targetStateIndex: transition.targetStateIndex,
          transitionIndex: transitionIndex | 0,
        };
      }
      continue;
    }
    const exitStatus = getStatechartExitStatus(instance, ri, transition);
    if (exitStatus === 'MissingRegionDuration') {
      return {
        blend: 0.0,
        conditionIndex: -1,
        regionIndex: regionIndex,
        sourceStateIndex: sourceStateIndex,
        status: 'MissingRegionDuration',
        targetStateIndex: transition.targetStateIndex,
        transitionIndex: transitionIndex | 0,
      };
    }
    if (exitStatus === 'ExitTimePending') {
      if (firstBlocked === null) {
        firstBlocked = {
          blend: 0.0,
          conditionIndex: -1,
          regionIndex: regionIndex,
          sourceStateIndex: sourceStateIndex,
          status: 'ExitTimePending',
          targetStateIndex: transition.targetStateIndex,
          transitionIndex: transitionIndex | 0,
        };
      }
      continue;
    }
    return {
      blend: 0.0,
      conditionIndex: -1,
      regionIndex: regionIndex,
      sourceStateIndex: sourceStateIndex,
      status: 'Ready',
      targetStateIndex: transition.targetStateIndex,
      transitionIndex: transitionIndex | 0,
    };
  }
  return firstBlocked!;
}

function advanceStatechartRegion(
  instance: StatechartInstanceRaw,
  chart: StatechartRaw,
  regionIndex: number,
  deltaTimeMs: number,
): boolean {
  const ri = regionIndex >>> 0;
  const sourceStateIndex = instance!.regionStates[ri];
  let transitionIndex = instance!.regionTransitions[ri];
  const sourceTransitionCount = getStatechartTransitionCount(chart, regionIndex, sourceStateIndex);
  instance!.regionElapsed[ri] += deltaTimeMs;
  if (transitionIndex >= 0) {
    if (transitionIndex >>> 0 >= sourceTransitionCount) {
      throw new RangeError(`Statechart region ${regionIndex} has an invalid active transition`);
    }
  } else {
    transitionIndex = getReadyTransitionIndex(instance, chart, regionIndex);
    if (transitionIndex < 0) {
      return false;
    }
    let current = instance!;
    current.regionTransitions[ri] = transitionIndex;
    current.regionBlend[ri] = 0.0;
  }
  let durationMs = chart!.regions[ri].states[sourceStateIndex >>> 0].transitions[transitionIndex >>> 0].durationMs;
  const target = chart!.regions[ri].states[sourceStateIndex >>> 0].transitions[transitionIndex >>> 0].targetStateIndex;
  durationMs = Number.isFinite(durationMs) && durationMs > 0.0 ? durationMs : 0.0;
  const blend = durationMs === 0.0 ? 1.0 : Math.min(instance!.regionBlend[ri] + deltaTimeMs / durationMs, 1.0);
  instance!.regionBlend[ri] = blend;
  if (blend < 1.0) {
    return false;
  }
  let current = instance!;
  current.regionStates[ri] = target;
  current.regionTransitions[ri] = -1;
  current.regionBlend[ri] = 0.0;
  current.regionDuration[ri] = 0.0;
  current.regionElapsed[ri] = 0.0;
  return true;
}

function assertStatechartInputKind(
  instance: StatechartInstanceRaw,
  inputIndex: number,
  expectedKind: StatechartInputKind,
): void {
  const chart = instance!.chart;
  const inputCount = chart!.inputs.length;
  if (!isStatechartInteger(inputIndex) || inputIndex < 0 || inputIndex >>> 0 >= inputCount) {
    throw new RangeError(`Statechart input index ${inputIndex} is out of range`);
  }
  const kind = chart!.inputs[inputIndex >>> 0].kind;
  if (kind !== expectedKind) {
    throwStatechartInputKindTypeError(inputIndex, kind, expectedKind);
  }
}

function clearStatechartTriggers(instance: StatechartInstanceRaw, chart: StatechartRaw): void {
  chart = chart!;
  let current = instance!;
  let inputIndex = 0;
  while (inputIndex < chart.inputs.length) {
    if (chart.inputs[inputIndex].kind === 'Trigger') {
      current.inputValues[inputIndex] = 0.0;
    }
    inputIndex += 1;
  }
}

function compareStatechartCondition(value: number, condition: Readonly<StatechartCondition>): boolean {
  return (() => {
    const matchValue = condition.comparison;
    switch (matchValue) {
      case 'Equal':
        return value === condition.value;
      case 'GreaterThan':
        return value > condition.value;
      case 'GreaterThanOrEqual':
        return value >= condition.value;
      case 'LessThan':
        return value < condition.value;
      case 'LessThanOrEqual':
        return value <= condition.value;
      case 'NotEqual':
        return value !== condition.value;
    }
  })();
}

export function fireStatechartTrigger(instance: StatechartInstanceRaw, inputIndex: number): void {
  assertStatechartInputKind(instance, inputIndex, 'Trigger');
  let current = instance!;
  current.inputValues[inputIndex >>> 0] = 1.0;
}

export function getStatechartInputIndex(chart: Readonly<StatechartRaw>, name: string): number {
  for (let inputIndex = 0; inputIndex < chart.inputs.length; inputIndex += 1) {
    if (chart.inputs[inputIndex].name === name) {
      return inputIndex | 0;
    }
  }
  return -1;
}

function getFirstUnmetCondition(
  instance: StatechartInstanceRaw,
  chart: Readonly<StatechartRaw>,
  transition: Readonly<StatechartTransition>,
): number {
  for (let conditionIndex = 0; conditionIndex < transition.conditions.length; conditionIndex += 1) {
    const condition = transition.conditions[conditionIndex];
    if (condition.inputIndex < 0 || condition.inputIndex >>> 0 >= chart.inputs.length) {
      return conditionIndex | 0;
    }
    const input = chart.inputs[condition.inputIndex >>> 0];
    const inputValue = instance!.inputValues[condition.inputIndex >>> 0];
    const met = input.kind === 'Trigger' ? inputValue !== 0.0 : compareStatechartCondition(inputValue, condition);
    if (!met) {
      return conditionIndex | 0;
    }
  }
  return -1;
}

function getReadyTransitionIndex(instance: StatechartInstanceRaw, chart: StatechartRaw, regionIndex: number): number {
  const ri = regionIndex >>> 0;
  const sourceStateIndex = instance!.regionStates[ri];
  const transitionCount = chart!.regions[ri].states[sourceStateIndex >>> 0].transitions.length;
  for (let transitionIndex = 0; transitionIndex < transitionCount; transitionIndex += 1) {
    const transition = chart!.regions[ri].states[sourceStateIndex >>> 0].transitions[transitionIndex];
    const unmet = getFirstUnmetCondition(instance, chart!, transition);
    const exitStatus = getStatechartExitStatus(instance, ri, transition);
    const target = transition.targetStateIndex;
    if (unmet >= 0 || exitStatus === 'ExitTimePending') {
      continue;
    }
    if (exitStatus === 'MissingRegionDuration') {
      const explanation: StatechartTransitionExplanation = {
        blend: 0.0,
        conditionIndex: -1,
        regionIndex: regionIndex,
        sourceStateIndex: sourceStateIndex,
        status: 'MissingRegionDuration',
        targetStateIndex: target,
        transitionIndex: transitionIndex | 0,
      } as const;
      const guard = instance!.durationGuard;
      if (guard !== null) {
        const durationGuard = guard;
        durationGuard(instance, explanation);
      }
    }
    return transitionIndex | 0;
  }
  return -1;
}

function getStatechartExitStatus(
  instance: StatechartInstanceRaw,
  regionIndex: number,
  transition: Readonly<StatechartTransition>,
): StatechartTransitionStatus {
  if (transition.exitTimeRatio < 0.0) {
    return 'Ready';
  }
  const current = instance!;
  const duration = current.regionDuration[regionIndex];
  if (duration <= 0.0) {
    return 'MissingRegionDuration';
  }
  return current.regionElapsed[regionIndex] / duration >= transition.exitTimeRatio ? 'Ready' : 'ExitTimePending';
}

export function getStatechartRegionBlend(instance: StatechartInstanceRaw, regionIndex: number): number {
  const current = instance!;
  if (isStatechartInteger(regionIndex) && regionIndex >= 0 && regionIndex >>> 0 < current.regionBlend.length) {
    return current.regionBlend[regionIndex >>> 0];
  }
  return -1.0;
}

export function getStatechartRegionState(instance: StatechartInstanceRaw, regionIndex: number): number {
  const current = instance!;
  if (isStatechartInteger(regionIndex) && regionIndex >= 0 && regionIndex >>> 0 < current.regionStates.length) {
    return current.regionStates[regionIndex >>> 0];
  }
  return -1;
}

export function initializeStatechartInstancePortable(
  out: EntityConstruction<StatechartInstanceRaw>,
  chart: StatechartRaw,
): void {
  validateStatechart(chart!);
  const chartInputCount = chart!.inputs.length;
  const chartRegionCount = chart!.regions.length;
  let inputValues = createStatechartFloat64Array(chartInputCount);
  for (let inputIndex = 0; inputIndex < chartInputCount; inputIndex += 1) {
    const chartGuard = chart!;
    const input = chartGuard.inputs[inputIndex];
    inputValues[inputIndex] = input.kind === 'Boolean' ? (input.initialValue === 0.0 ? 0.0 : 1.0) : input.initialValue;
  }
  const regionCount = chartRegionCount;
  let regionStates = createStatechartInt32Array(regionCount, 0);
  for (let regionIndex = 0; regionIndex < regionCount; regionIndex += 1) {
    regionStates[regionIndex] = chart!.regions[regionIndex].initialStateIndex;
  }
  initializeStatechartInstanceFields(
    out,
    chart,
    inputValues,
    createStatechartFloat32Array(regionCount),
    createStatechartFloat64Array(regionCount),
    createStatechartFloat64Array(regionCount),
    regionStates,
    createStatechartInt32Array(regionCount, -1),
  );
}

function getStatechartTransitionCount(chart: StatechartRaw, regionIndex: number, sourceStateIndex: number): number {
  chart = chart!;
  const region = chart.regions[regionIndex >>> 0];
  if (sourceStateIndex < 0 || sourceStateIndex >>> 0 >= region.states.length) {
    throw new RangeError(`Statechart region ${regionIndex} has an invalid active state`);
  }
  return region.states[sourceStateIndex >>> 0].transitions.length;
}

function invalidRegionExplanation(regionIndex: number): StatechartTransitionExplanation {
  return {
    blend: -1.0,
    conditionIndex: -1,
    regionIndex: regionIndex,
    sourceStateIndex: -1,
    status: 'InvalidRegion',
    targetStateIndex: -1,
    transitionIndex: -1,
  };
}

export function setStatechartBooleanInput(instance: StatechartInstanceRaw, inputIndex: number, value: boolean): void {
  assertStatechartInputKind(instance, inputIndex, 'Boolean');
  let current = instance!;
  current.inputValues[inputIndex >>> 0] = value ? 1.0 : 0.0;
}

export function setStatechartNumberInput(instance: StatechartInstanceRaw, inputIndex: number, value: number): void {
  assertStatechartInputKind(instance, inputIndex, 'Number');
  let current = instance!;
  current.inputValues[inputIndex >>> 0] = value;
}

export function setStatechartRegionDuration(
  instance: StatechartInstanceRaw,
  regionIndex: number,
  duration: number,
): void {
  const len = instance!.regionDuration.length;
  if (!isStatechartInteger(regionIndex) || regionIndex < 0 || regionIndex >>> 0 >= len) {
    throw new RangeError(`Statechart region index ${regionIndex} is out of range`);
  }
  if (!Number.isFinite(duration) || duration < 0.0) {
    throw new RangeError('Statechart region duration must be finite and non-negative');
  }
  instance!.regionDuration[regionIndex >>> 0] = duration;
}

function validateStatechart(chart: Readonly<StatechartRaw>): void {
  for (let inputIndex = 0; inputIndex < chart.inputs.length; inputIndex += 1) {
    const kind = chart.inputs[inputIndex].kind;
    if (kind !== 'Boolean' && kind !== 'Number' && kind !== 'Trigger') {
      throwStatechartUnknownInputKindTypeError(inputIndex, kind);
    }
  }
  for (let regionIndex = 0; regionIndex < chart.regions.length; regionIndex += 1) {
    const region = chart.regions[regionIndex];
    if (
      !isStatechartInteger(region.initialStateIndex) ||
      region.initialStateIndex < 0 ||
      region.initialStateIndex >>> 0 >= region.states.length
    ) {
      throw new RangeError(`Statechart region ${regionIndex} has an invalid initialStateIndex`);
    }
    for (let stateIndex = 0; stateIndex < region.states.length; stateIndex += 1) {
      const state = region.states[stateIndex];
      if (!isStatechartString(state.kind) || state.kind.length === 0) {
        throwStatechartTypeError(`Statechart region ${regionIndex} state ${stateIndex} has an invalid kind`);
      }
      for (let transitionIndex = 0; transitionIndex < state.transitions.length; transitionIndex += 1) {
        const transition = state.transitions[transitionIndex];
        if (!Number.isFinite(transition.durationMs) || transition.durationMs < 0.0) {
          throw new RangeError(
            `Statechart region ${regionIndex} state ${stateIndex} transition ${transitionIndex} has an invalid duration`,
          );
        }
        if (!Number.isFinite(transition.exitTimeRatio) || transition.exitTimeRatio < -1.0) {
          throw new RangeError(
            `Statechart region ${regionIndex} state ${stateIndex} transition ${transitionIndex} has an invalid exit time`,
          );
        }
        if (
          !isStatechartInteger(transition.targetStateIndex) ||
          transition.targetStateIndex < 0 ||
          transition.targetStateIndex >>> 0 >= region.states.length
        ) {
          throw new RangeError(
            `Statechart region ${regionIndex} state ${stateIndex} transition ${transitionIndex} has an invalid target`,
          );
        }
        for (let conditionIndex = 0; conditionIndex < transition.conditions.length; conditionIndex += 1) {
          const condition = transition.conditions[conditionIndex];
          if (
            !isStatechartInteger(condition.inputIndex) ||
            condition.inputIndex < 0 ||
            condition.inputIndex >>> 0 >= chart.inputs.length
          ) {
            throw new RangeError(
              `Statechart region ${regionIndex} state ${stateIndex} transition ${transitionIndex} has an invalid input`,
            );
          }
          if (!isStatechartComparison(condition.comparison)) {
            throwStatechartTypeError(
              `Statechart region ${regionIndex} state ${stateIndex} transition ${transitionIndex} has an invalid comparison`,
            );
          }
        }
      }
    }
  }
}
