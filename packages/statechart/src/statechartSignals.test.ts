import { connectSignal } from '@flighthq/signals/contract';
import { StatechartAtomicStateKind } from '@flighthq/types/contract';
import type { Statechart } from '@flighthq/types/contract';

import {
  advanceStatechartInstance,
  createStatechartInstance,
  fireStatechartTrigger,
  setStatechartRegionDuration,
} from './statechart';
import { enableStatechartSignals, getStatechartSignals, initializeStatechartSignals } from './statechartSignals';

describe('enableStatechartSignals', () => {
  it('lazily attaches one standard signal group to the mutable instance', () => {
    const instance = createStatechartInstance(createImmediateChart());
    const first = enableStatechartSignals(instance);
    const second = enableStatechartSignals(instance);
    expect(first).toBe(second);
    expect(instance.signals).toBe(first);
    expect(first.onStateChange.data).toBeNull();
  });

  it('observes completed entry and exit without putting a closure on authored state data', () => {
    const chart = createImmediateChart();
    const instance = createStatechartInstance(chart);
    const calls: number[][] = [];
    connectSignal(enableStatechartSignals(instance).onStateChange, (regionIndex, previousState, state) => {
      calls.push([regionIndex, previousState, state]);
    });

    expect(JSON.stringify(chart)).not.toContain('onEnter');
    advanceStatechartInstance(instance, 0);
    expect(calls).toEqual([[0, 0, 1]]);
  });

  it('emits after trigger cleanup so a listener can latch an edge for the next pass', () => {
    const chart: Statechart = {
      inputs: [{ initialValue: 0, kind: 'Trigger' }],
      regions: [
        {
          initialStateIndex: 0,
          states: [
            {
              kind: StatechartAtomicStateKind,
              transitions: [{ conditions: [], durationMs: 0, exitTimeRatio: -1, targetStateIndex: 1 }],
            },
            { kind: StatechartAtomicStateKind, transitions: [] },
          ],
        },
      ],
    };
    const instance = createStatechartInstance(chart);
    connectSignal(enableStatechartSignals(instance).onStateChange, () => {
      fireStatechartTrigger(instance, 0);
    });
    advanceStatechartInstance(instance, 0);
    expect(instance.inputValues[0]).toBe(1);
  });

  it('lets composition supply the entered state duration after core resets the old one', () => {
    const instance = createStatechartInstance(createImmediateChart());
    setStatechartRegionDuration(instance, 0, 100);
    connectSignal(enableStatechartSignals(instance).onStateChange, (regionIndex) => {
      setStatechartRegionDuration(instance, regionIndex, 250);
    });
    advanceStatechartInstance(instance, 0);
    expect(instance.regionDuration[0]).toBe(250);
  });
});

describe('getStatechartSignals', () => {
  it('returns null before enablement and the group afterward', () => {
    const instance = createStatechartInstance(createImmediateChart());
    expect(getStatechartSignals(instance)).toBeNull();
    const signals = enableStatechartSignals(instance);
    expect(getStatechartSignals(instance)).toBe(signals);
  });
});

function createImmediateChart(): Statechart {
  return {
    inputs: [],
    regions: [
      {
        initialStateIndex: 0,
        states: [
          {
            kind: StatechartAtomicStateKind,
            transitions: [{ conditions: [], durationMs: 0, exitTimeRatio: -1, targetStateIndex: 1 }],
          },
          { kind: StatechartAtomicStateKind, transitions: [] },
        ],
      },
    ],
  };
}
describe('initializeStatechartSignals', () => {
  it('is the construction initializer of createStatechartSignals', () => {
    expect(typeof initializeStatechartSignals).toBe('function');
  });
});
