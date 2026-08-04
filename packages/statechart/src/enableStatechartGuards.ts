import { logOnce } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';
import type { StatechartInstance, StatechartTransitionExplanation } from '@flighthq/types/contract';

// Report whether caller-misuse diagnostics are installed for this actor.
export function areStatechartGuardsEnabled(instance: Readonly<StatechartInstance>): boolean {
  return instance.durationGuard === warnMissingStatechartRegionDuration;
}

// Remove the opt-in diagnostics hook without changing transition behavior.
export function disableStatechartGuards(instance: StatechartInstance): void {
  instance.durationGuard = null;
}

// Install state-scoped warnings for exit-time transitions whose composition layer never supplied a
// positive state duration. Core still coerces that gate to no requirement; this module owns the message
// and @flighthq/log dependency, so an unguarded count/read consumer sheds both completely.
export function enableStatechartGuards(instance: StatechartInstance): void {
  instance.durationGuard = warnMissingStatechartRegionDuration;
}

function warnMissingStatechartRegionDuration(
  instance: Readonly<StatechartInstance>,
  explanation: Readonly<StatechartTransitionExplanation>,
): void {
  const chartId = getStatechartGuardChartId(instance.chart);
  logOnce(
    `statechart:missing-region-duration:${chartId}:${explanation.regionIndex}:${explanation.sourceStateIndex}:${explanation.transitionIndex}`,
    LogLevel.Warn,
    {
      exitTimeRatio:
        instance.chart.regions[explanation.regionIndex]?.states[explanation.sourceStateIndex]?.transitions[
          explanation.transitionIndex
        ]?.exitTimeRatio ?? -1,
      message:
        'advanceStatechartInstance: exitTimeRatio requires a positive region duration; the transition was treated as having no exit-time requirement — call setStatechartRegionDuration when the region enters a state.',
      regionDuration: instance.regionDuration[explanation.regionIndex] ?? -1,
      regionIndex: explanation.regionIndex,
      sourceStateIndex: explanation.sourceStateIndex,
      status: explanation.status,
      targetStateIndex: explanation.targetStateIndex,
      transitionIndex: explanation.transitionIndex,
    },
    'statechart',
  );
}

function getStatechartGuardChartId(chart: Readonly<object>): number {
  let id = statechartGuardChartIds.get(chart);
  if (id === undefined) {
    id = nextStatechartGuardChartId++;
    statechartGuardChartIds.set(chart, id);
  }
  return id;
}

const statechartGuardChartIds = new WeakMap<object, number>();
let nextStatechartGuardChartId = 1;
