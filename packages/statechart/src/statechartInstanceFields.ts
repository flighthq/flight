import type { Statechart, StatechartInstance } from './types.ts';

export function initializeStatechartInstanceFields(
  out: StatechartInstance,
  chart: Readonly<Statechart>,
  inputValues: Float64Array,
  regionBlend: Float32Array,
  regionDuration: Float64Array,
  regionElapsed: Float64Array,
  regionStates: Int32Array,
  regionTransitions: Int32Array,
): void {
  const target = out as { -readonly [Key in keyof StatechartInstance]: StatechartInstance[Key] };
  target.chart = chart;
  target.durationGuard = null;
  target.inputValues = inputValues;
  target.regionBlend = regionBlend;
  target.regionDuration = regionDuration;
  target.regionElapsed = regionElapsed;
  target.regionStates = regionStates;
  target.regionTransitions = regionTransitions;
  target.signals = null;
}
