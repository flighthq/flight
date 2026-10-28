import type { LogState } from '@flighthq/log/contract';
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
// and @flighthq/log dependency, so an unguarded count/read consumer sheds both completely. Warnings go to
// the caller-owned `logState`, stamped with `clock()` when reported.
export function enableStatechartGuards(instance: StatechartInstance, logState: LogState, clock: () => number): void {
  statechartGuardLogs.set(instance, { clock, logState });
  instance.durationGuard = warnMissingStatechartRegionDuration;
}

function warnMissingStatechartRegionDuration(
  instance: Readonly<StatechartInstance>,
  explanation: Readonly<StatechartTransitionExplanation>,
): void {
  const log = statechartGuardLogs.get(instance);
  if (log === undefined) return;
  const chartId = getStatechartGuardChartId(instance.chart);
  logOnce(
    log.logState,
    log.clock(),
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

interface StatechartGuardLog {
  readonly clock: () => number;
  readonly logState: LogState;
}

const statechartGuardChartIds = new WeakMap<object, number>();
// The log state and clock each instance's guard reports into, so the installed guard stays one shared
// function (areStatechartGuardsEnabled compares it by identity).
const statechartGuardLogs = new WeakMap<Readonly<StatechartInstance>, StatechartGuardLog>();
let nextStatechartGuardChartId = 1;
