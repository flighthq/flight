import type { LogState } from '@flighthq/log/contract';
import { addLogSink, createLogState, createMemoryLogSink, getMemoryLogSinkEntries } from '@flighthq/log/contract';
import { StatechartAtomicStateKind, StatechartTransitionStatus } from '@flighthq/types/contract';
import type { LogEntry, Statechart } from '@flighthq/types/contract';

import {
  areStatechartGuardsEnabled,
  disableStatechartGuards,
  enableStatechartGuards,
} from './enableStatechartGuards.ts';
import { advanceStatechartInstance, createStatechartInstance, setStatechartRegionDuration } from './statechart.ts';

let logState: LogState;

beforeEach(() => {
  logState = createLogState();
});

describe('areStatechartGuardsEnabled', () => {
  it('reports guard state per actor', () => {
    const guarded = createStatechartInstance(createExitTimeChart());
    const unguarded = createStatechartInstance(createExitTimeChart());
    enableStatechartGuards(guarded, logState, () => 0);
    expect(areStatechartGuardsEnabled(guarded)).toBe(true);
    expect(areStatechartGuardsEnabled(unguarded)).toBe(false);
  });
});

describe('disableStatechartGuards', () => {
  it('restores silent coercion without changing transition behavior', () => {
    const instance = createStatechartInstance(createExitTimeChart());
    enableStatechartGuards(instance, logState, () => 0);
    disableStatechartGuards(instance);
    const entries = captureLog(() => {
      expect(advanceStatechartInstance(instance, 0)).toBe(1);
    });
    expect(entries).toEqual([]);
  });
});

describe('enableStatechartGuards', () => {
  it('warns once and names the duration setter while preserving no-requirement coercion', () => {
    const instance = createStatechartInstance(createExitTimeChart());
    enableStatechartGuards(instance, logState, () => 0);
    const entries = captureLog(() => {
      expect(advanceStatechartInstance(instance, 0)).toBe(1);
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ channel: 'statechart', level: 2 });
    expect(entries[0].data).toMatchObject({
      exitTimeRatio: 0.5,
      regionDuration: 0,
      regionIndex: 0,
      status: StatechartTransitionStatus.MissingRegionDuration,
      transitionIndex: 0,
    });
    expect(String((entries[0].data as Record<string, unknown>).message)).toContain('setStatechartRegionDuration');
  });

  it('stays silent when a positive duration makes the exit-time ratio well-defined', () => {
    const instance = createStatechartInstance(createExitTimeChart());
    enableStatechartGuards(instance, logState, () => 0);
    setStatechartRegionDuration(instance, 0, 100);
    const entries = captureLog(() => {
      expect(advanceStatechartInstance(instance, 49)).toBe(0);
      expect(advanceStatechartInstance(instance, 1)).toBe(1);
    });
    expect(entries).toEqual([]);
  });

  it('keeps the production-default coercion silent when guards were never enabled', () => {
    const instance = createStatechartInstance(createExitTimeChart());
    const entries = captureLog(() => {
      expect(advanceStatechartInstance(instance, 0)).toBe(1);
    });
    expect(entries).toEqual([]);
  });
});

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(logState, sink.sink);
  run();
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  return entries;
}

function createExitTimeChart(): Statechart {
  return {
    inputs: [],
    regions: [
      {
        initialStateIndex: 0,
        states: [
          {
            kind: StatechartAtomicStateKind,
            transitions: [{ conditions: [], durationMs: 0, exitTimeRatio: 0.5, targetStateIndex: 1 }],
          },
          { kind: StatechartAtomicStateKind, transitions: [] },
        ],
      },
    ],
  };
}
