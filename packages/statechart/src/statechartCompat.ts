import { Entity, attachEntityWrapper, getEntityWrapperAs } from '@flighthq/entity/contract';
import type { LogState } from '@flighthq/log/contract';

import {
  areStatechartGuardsEnabled,
  disableStatechartGuards,
  enableStatechartGuards,
} from './enableStatechartGuards.ts';
import {
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
import { enableStatechartSignals, getStatechartSignals } from './statechartSignals.ts';
import type {
  StatechartDurationGuard,
  StatechartInput,
  StatechartInstanceRaw,
  StatechartRaw,
  StatechartRegion,
  StatechartSignals,
  StatechartTransitionExplanation,
} from './types.ts';

/** Entity/OOP companion for immutable authored statechart data. */
export class Statechart extends Entity {
  declare readonly raw: StatechartRaw;

  constructor(raw: StatechartRaw = { inputs: [], regions: [] }) {
    super(raw);
  }

  static override create(): Statechart {
    return new Statechart();
  }

  static override from(raw: StatechartRaw): Statechart {
    const existing = getEntityWrapperAs<Entity>(raw);
    if (existing === null) return new Statechart(raw);
    if (existing instanceof Statechart) return existing;
    throw new TypeError('StatechartRaw is already attached to an incompatible OOP wrapper');
  }

  get inputs(): readonly Readonly<StatechartInput>[] {
    return this.raw.inputs;
  }

  get name(): string | undefined {
    return this.raw.name;
  }

  get regions(): readonly Readonly<StatechartRegion>[] {
    return this.raw.regions;
  }

  getInputIndex(name: string): number {
    return getStatechartInputIndex(this.raw, name);
  }
}

/** Entity/OOP companion for the mutable actor half of a statechart. */
export class StatechartInstance extends Entity {
  declare readonly raw: StatechartInstanceRaw;

  constructor(chart: Readonly<StatechartRaw> | Statechart = new Statechart()) {
    super(createStatechartInstance(chart instanceof Statechart ? chart.raw : chart));
  }

  static override create(chart: Readonly<StatechartRaw> | Statechart = new Statechart()): StatechartInstance {
    return new StatechartInstance(chart);
  }

  static override from(raw: StatechartInstanceRaw): StatechartInstance {
    const existing = getEntityWrapperAs<Entity>(raw);
    if (existing === null) {
      const wrapper = Object.create(StatechartInstance.prototype) as StatechartInstance;
      Object.assign(wrapper, { raw });
      attachEntityWrapper(raw, wrapper);
      return wrapper;
    }
    if (existing instanceof StatechartInstance) return existing;
    throw new TypeError('StatechartInstanceRaw is already attached to an incompatible OOP wrapper');
  }

  get chart(): Readonly<StatechartRaw> {
    return this.raw.chart;
  }

  get durationGuard(): StatechartDurationGuard | null {
    return this.raw.durationGuard;
  }

  set durationGuard(value: StatechartDurationGuard | null) {
    this.raw.durationGuard = value;
  }

  get inputValues(): Float64Array {
    return this.raw.inputValues;
  }

  get regionBlendValues(): Float32Array {
    return this.raw.regionBlend;
  }

  get regionDuration(): Float64Array {
    return this.raw.regionDuration;
  }

  get regionElapsed(): Float64Array {
    return this.raw.regionElapsed;
  }

  get regionStates(): Int32Array {
    return this.raw.regionStates;
  }

  get regionTransitions(): Int32Array {
    return this.raw.regionTransitions;
  }

  get signals(): StatechartSignals | null {
    return this.raw.signals;
  }

  set signals(value: StatechartSignals | null) {
    this.raw.signals = value;
  }

  advance(deltaTime: number): number {
    return advanceStatechartInstance(this.raw, deltaTime);
  }

  disableGuards(): void {
    disableStatechartGuards(this.raw);
  }

  enableGuards(logState: LogState, clock: () => number): void {
    enableStatechartGuards(this.raw, logState, clock);
  }

  enableSignals(): StatechartSignals {
    return enableStatechartSignals(this.raw);
  }

  explainTransition(regionIndex: number): StatechartTransitionExplanation {
    return explainStatechartTransition(this.raw, regionIndex);
  }

  fireTrigger(inputIndex: number): void {
    fireStatechartTrigger(this.raw, inputIndex);
  }

  getSignals(): StatechartSignals | null {
    return getStatechartSignals(this.raw);
  }

  guardsEnabled(): boolean {
    return areStatechartGuardsEnabled(this.raw);
  }

  regionBlend(regionIndex: number): number {
    return getStatechartRegionBlend(this.raw, regionIndex);
  }

  regionState(regionIndex: number): number {
    return getStatechartRegionState(this.raw, regionIndex);
  }

  setBooleanInput(inputIndex: number, value: boolean): void {
    setStatechartBooleanInput(this.raw, inputIndex, value);
  }

  setNumberInput(inputIndex: number, value: number): void {
    setStatechartNumberInput(this.raw, inputIndex, value);
  }

  setRegionDuration(regionIndex: number, duration: number): void {
    setStatechartRegionDuration(this.raw, regionIndex, duration);
  }
}
