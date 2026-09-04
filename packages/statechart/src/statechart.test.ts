import {
  StatechartAtomicStateKind,
  StatechartComparison,
  StatechartInputKind,
  StatechartNestedStateKind,
  StatechartTransitionStatus,
} from '@flighthq/types/contract';
import type { Statechart, StatechartCondition, StatechartTransition } from '@flighthq/types/contract';

import {
  advanceStatechartInstance,
  createStatechartInstance,
  explainStatechartTransition,
  fireStatechartTrigger,
  getStatechartInputIndex,
  getStatechartRegionBlend,
  getStatechartRegionState,
  initializeStatechartInstance,
  setStatechartBooleanInput,
  setStatechartNumberInput,
  setStatechartRegionDuration,
} from './statechart';

describe('advanceStatechartInstance', () => {
  it('advances every concurrent region before clearing a shared trigger', () => {
    const chart = createTwoRegionTriggerChart();
    const instance = createStatechartInstance(chart);

    fireStatechartTrigger(instance, 0);
    expect(advanceStatechartInstance(instance, 0)).toBe(2);
    expect([...instance.regionStates]).toEqual([1, 1]);
    expect(instance.inputValues[0]).toBe(0);
  });

  it('requires all data-only conditions and selects the first eligible transition', () => {
    const chart: Statechart = {
      inputs: [
        { initialValue: 0, kind: StatechartInputKind.Boolean, name: 'armed' },
        { initialValue: 2, kind: StatechartInputKind.Number, name: 'speed' },
      ],
      regions: [
        {
          initialStateIndex: 0,
          states: [
            {
              kind: StatechartAtomicStateKind,
              transitions: [
                transition(1, [condition(0, StatechartComparison.Equal, 1)]),
                transition(2, [
                  condition(0, StatechartComparison.Equal, 0),
                  condition(1, StatechartComparison.GreaterThan, 4),
                ]),
                transition(1, [
                  condition(0, StatechartComparison.Equal, 0),
                  condition(1, StatechartComparison.LessThanOrEqual, 2),
                ]),
              ],
            },
            { kind: StatechartAtomicStateKind, transitions: [] },
            { kind: StatechartAtomicStateKind, transitions: [] },
          ],
        },
      ],
    };
    const instance = createStatechartInstance(chart);

    expect(advanceStatechartInstance(instance, 0)).toBe(1);
    expect(instance.regionStates[0]).toBe(1);
  });

  it.each([
    [StatechartComparison.Equal, 3, 3, true],
    [StatechartComparison.GreaterThan, 3, 2, true],
    [StatechartComparison.GreaterThanOrEqual, 3, 3, true],
    [StatechartComparison.LessThan, 3, 4, true],
    [StatechartComparison.LessThanOrEqual, 3, 3, true],
    [StatechartComparison.NotEqual, 3, 4, true],
  ])('evaluates the %s numeric comparison', (comparison, inputValue, expectedValue, expected) => {
    const chart = createSingleTransitionChart(
      [{ initialValue: inputValue, kind: StatechartInputKind.Number }],
      [condition(0, comparison, expectedValue)],
    );
    expect(advanceStatechartInstance(createStatechartInstance(chart), 0) === 1).toBe(expected);
  });

  it('reports blend progress without performing composition and changes state at completion', () => {
    const chart = createSingleTransitionChart([], [], { durationMs: 100 });
    const instance = createStatechartInstance(chart);

    expect(advanceStatechartInstance(instance, 40)).toBe(0);
    expect(instance.regionStates[0]).toBe(0);
    expect(getStatechartRegionBlend(instance, 0)).toBeCloseTo(0.4);
    expect(advanceStatechartInstance(instance, 60)).toBe(1);
    expect(instance.regionStates[0]).toBe(1);
    expect(getStatechartRegionBlend(instance, 0)).toBe(0);
  });

  it('accumulates elapsed time and evaluates exitTimeRatio against the caller-supplied duration', () => {
    const chart = createSingleTransitionChart([], [], { exitTimeRatio: 0.5 });
    const instance = createStatechartInstance(chart);
    setStatechartRegionDuration(instance, 0, 100);

    expect(advanceStatechartInstance(instance, 49)).toBe(0);
    expect(instance.regionElapsed[0]).toBe(49);
    expect(advanceStatechartInstance(instance, 1)).toBe(1);
    expect(instance.regionStates[0]).toBe(1);
    expect(instance.regionElapsed[0]).toBe(0);
    expect(instance.regionDuration[0]).toBe(0);
  });

  it('changes a region at most once per call even when the target has an immediate transition', () => {
    const chart: Statechart = {
      inputs: [],
      regions: [
        {
          initialStateIndex: 0,
          states: [
            { kind: StatechartAtomicStateKind, transitions: [transition(1)] },
            { kind: StatechartAtomicStateKind, transitions: [transition(2)] },
            { kind: StatechartAtomicStateKind, transitions: [] },
          ],
        },
      ],
    };
    const instance = createStatechartInstance(chart);

    expect(advanceStatechartInstance(instance, 0)).toBe(1);
    expect(instance.regionStates[0]).toBe(1);
    expect(advanceStatechartInstance(instance, 0)).toBe(1);
    expect(instance.regionStates[0]).toBe(2);
  });

  it('treats non-positive and non-finite time as no blend progress', () => {
    const chart = createSingleTransitionChart([], [], { durationMs: 100 });
    const instance = createStatechartInstance(chart);

    expect(advanceStatechartInstance(instance, -1)).toBe(0);
    expect(advanceStatechartInstance(instance, Number.NaN)).toBe(0);
    expect(instance.regionBlend[0]).toBe(0);
  });
});

describe('createStatechartInstance', () => {
  it('creates independent typed-array actor state while retaining the immutable chart', () => {
    const chart: Statechart = {
      inputs: [
        { initialValue: -2, kind: StatechartInputKind.Boolean },
        { initialValue: 3.5, kind: StatechartInputKind.Number },
        { initialValue: 0, kind: StatechartInputKind.Trigger },
      ],
      name: 'shared',
      regions: [
        {
          initialStateIndex: 1,
          states: [
            { kind: StatechartNestedStateKind, transitions: [] },
            { kind: 'acme.CustomState', transitions: [] },
          ],
        },
      ],
    };

    const first = createStatechartInstance(chart);
    const second = createStatechartInstance(chart);
    expect(first.chart).toBe(chart);
    expect(first.chart).toBe(second.chart);
    expect(first.inputValues).toBeInstanceOf(Float64Array);
    expect([...first.inputValues]).toEqual([1, 3.5, 0]);
    expect(first.regionBlend).toBeInstanceOf(Float32Array);
    expect(first.regionDuration).toBeInstanceOf(Float64Array);
    expect(first.regionElapsed).toBeInstanceOf(Float64Array);
    expect(first.regionStates).toBeInstanceOf(Int32Array);
    expect(first.regionTransitions).toBeInstanceOf(Int32Array);
    expect([...first.regionStates]).toEqual([1]);
    expect([...first.regionTransitions]).toEqual([-1]);
    expect(first.durationGuard).toBeNull();
    expect(first.signals).toBeNull();

    first.inputValues[1] = 9;
    expect(second.inputValues[1]).toBe(3.5);
  });

  it('rejects malformed authored indices as programmer errors', () => {
    const chart: Statechart = {
      inputs: [],
      regions: [{ initialStateIndex: 1, states: [{ kind: StatechartAtomicStateKind, transitions: [] }] }],
    };
    expect(() => createStatechartInstance(chart)).toThrow(RangeError);
  });

  it('accepts nested and vendor-prefixed state kinds without closed dispatch', () => {
    const chart: Statechart = {
      inputs: [],
      regions: [
        {
          initialStateIndex: 0,
          states: [
            { kind: StatechartNestedStateKind, transitions: [] },
            { kind: 'vendor.Special', transitions: [] },
          ],
        },
      ],
    };
    expect(() => createStatechartInstance(chart)).not.toThrow();
  });
});

describe('explainStatechartTransition', () => {
  it('returns an invalid-region diagnostic for the silent getter sentinel', () => {
    const explanation = explainStatechartTransition(createStatechartInstance(createEmptyChart()), 4);
    expect(explanation).toEqual({
      blend: -1,
      conditionIndex: -1,
      regionIndex: 4,
      sourceStateIndex: -1,
      status: StatechartTransitionStatus.InvalidRegion,
      targetStateIndex: -1,
      transitionIndex: -1,
    });
  });

  it('reports a state with no transitions', () => {
    const explanation = explainStatechartTransition(createStatechartInstance(createEmptyChart()), 0);
    expect(explanation.status).toBe(StatechartTransitionStatus.NoTransitions);
    expect(explanation.transitionIndex).toBe(-1);
  });

  it('identifies the first unmet condition', () => {
    const chart = createSingleTransitionChart(
      [{ initialValue: 0, kind: StatechartInputKind.Number }],
      [condition(0, StatechartComparison.GreaterThan, 2)],
    );
    const explanation = explainStatechartTransition(createStatechartInstance(chart), 0);
    expect(explanation.status).toBe(StatechartTransitionStatus.ConditionsUnmet);
    expect(explanation.conditionIndex).toBe(0);
    expect(explanation.targetStateIndex).toBe(1);
  });

  it('reports ready and transitioning states without mutation', () => {
    const chart = createSingleTransitionChart([], [], { durationMs: 100 });
    const instance = createStatechartInstance(chart);
    expect(explainStatechartTransition(instance, 0).status).toBe(StatechartTransitionStatus.Ready);
    advanceStatechartInstance(instance, 25);
    const explanation = explainStatechartTransition(instance, 0);
    expect(explanation.status).toBe(StatechartTransitionStatus.Transitioning);
    expect(explanation.blend).toBeCloseTo(0.25);
    expect(explanation.transitionIndex).toBe(0);
  });

  it('reports a satisfied guard waiting on exit time', () => {
    const chart = createSingleTransitionChart([], [], { exitTimeRatio: 0.5 });
    const instance = createStatechartInstance(chart);
    setStatechartRegionDuration(instance, 0, 100);
    const explanation = explainStatechartTransition(instance, 0);
    expect(explanation.status).toBe(StatechartTransitionStatus.ExitTimePending);
    expect(explanation.conditionIndex).toBe(-1);
  });

  it('reports a missing duration that runtime coerces to no exit-time requirement', () => {
    const chart = createSingleTransitionChart([], [], { exitTimeRatio: 0.5 });
    const explanation = explainStatechartTransition(createStatechartInstance(chart), 0);
    expect(explanation.status).toBe(StatechartTransitionStatus.MissingRegionDuration);
    expect(explanation.transitionIndex).toBe(0);
  });
});

describe('fireStatechartTrigger', () => {
  it('latches a trigger until all regions see the next advance and ignores condition value', () => {
    const instance = createStatechartInstance(createTwoRegionTriggerChart());
    fireStatechartTrigger(instance, 0);
    expect(instance.inputValues[0]).toBe(1);
    expect(advanceStatechartInstance(instance, 0)).toBe(2);
    expect(instance.inputValues[0]).toBe(0);
  });

  it('throws for an invalid index or non-trigger input', () => {
    const instance = createStatechartInstance(
      createSingleTransitionChart([{ initialValue: 0, kind: StatechartInputKind.Number }]),
    );
    expect(() => fireStatechartTrigger(instance, -1)).toThrow(RangeError);
    expect(() => fireStatechartTrigger(instance, 0)).toThrow(TypeError);
  });
});

describe('getStatechartInputIndex', () => {
  it('returns the first matching input index and -1 when absent', () => {
    const chart: Statechart = {
      inputs: [
        { initialValue: 0, kind: StatechartInputKind.Number, name: 'speed' },
        { initialValue: 1, kind: StatechartInputKind.Number, name: 'speed' },
      ],
      regions: [],
    };
    expect(getStatechartInputIndex(chart, 'speed')).toBe(0);
    expect(getStatechartInputIndex(chart, 'missing')).toBe(-1);
  });
});

describe('getStatechartRegionBlend', () => {
  it('returns a region blend and -1 for invalid regions', () => {
    const instance = createStatechartInstance(createEmptyChart());
    instance.regionBlend[0] = 0.4;
    expect(getStatechartRegionBlend(instance, 0)).toBeCloseTo(0.4);
    expect(getStatechartRegionBlend(instance, -1)).toBe(-1);
    expect(getStatechartRegionBlend(instance, 1)).toBe(-1);
  });
});

describe('getStatechartRegionState', () => {
  it('returns a region state and -1 for invalid regions', () => {
    const instance = createStatechartInstance(createEmptyChart());
    expect(getStatechartRegionState(instance, 0)).toBe(0);
    expect(getStatechartRegionState(instance, -1)).toBe(-1);
    expect(getStatechartRegionState(instance, 1)).toBe(-1);
  });
});

describe('initializeStatechartInstance', () => {
  it('is the construction initializer of createStatechartInstance', () => {
    expect(typeof initializeStatechartInstance).toBe('function');
  });
});

describe('setStatechartBooleanInput', () => {
  it('writes the Boolean input vocabulary as numeric 0/1', () => {
    const instance = createStatechartInstance(
      createSingleTransitionChart([{ initialValue: 0, kind: StatechartInputKind.Boolean }]),
    );
    setStatechartBooleanInput(instance, 0, true);
    expect(instance.inputValues[0]).toBe(1);
    setStatechartBooleanInput(instance, 0, false);
    expect(instance.inputValues[0]).toBe(0);
  });

  it('throws for an invalid index or non-Boolean input', () => {
    const instance = createStatechartInstance(
      createSingleTransitionChart([{ initialValue: 0, kind: StatechartInputKind.Number }]),
    );
    expect(() => setStatechartBooleanInput(instance, 1, true)).toThrow(RangeError);
    expect(() => setStatechartBooleanInput(instance, 0, true)).toThrow(TypeError);
  });
});

describe('setStatechartNumberInput', () => {
  it('writes an exact numeric value', () => {
    const instance = createStatechartInstance(
      createSingleTransitionChart([{ initialValue: 0, kind: StatechartInputKind.Number }]),
    );
    setStatechartNumberInput(instance, 0, -3.25);
    expect(instance.inputValues[0]).toBe(-3.25);
  });

  it('throws for an invalid index or non-Number input', () => {
    const instance = createStatechartInstance(
      createSingleTransitionChart([{ initialValue: 0, kind: StatechartInputKind.Boolean }]),
    );
    expect(() => setStatechartNumberInput(instance, 1, 2)).toThrow(RangeError);
    expect(() => setStatechartNumberInput(instance, 0, 2)).toThrow(TypeError);
  });
});

function condition(inputIndex: number, comparison: StatechartComparison, value: number): StatechartCondition {
  return { comparison, inputIndex, value };
}

function createEmptyChart(): Statechart {
  return {
    inputs: [],
    regions: [{ initialStateIndex: 0, states: [{ kind: StatechartAtomicStateKind, transitions: [] }] }],
  };
}

function createSingleTransitionChart(
  inputs: Statechart['inputs'],
  conditions: readonly StatechartCondition[] = [],
  options: Partial<Pick<StatechartTransition, 'durationMs' | 'exitTimeRatio'>> = {},
): Statechart {
  return {
    inputs,
    regions: [
      {
        initialStateIndex: 0,
        states: [
          {
            kind: StatechartAtomicStateKind,
            transitions: [transition(1, conditions, options)],
          },
          { kind: StatechartAtomicStateKind, transitions: [] },
        ],
      },
    ],
  };
}

function createTwoRegionTriggerChart(): Statechart {
  const triggerTransition = transition(1, [condition(0, StatechartComparison.GreaterThan, 999)]);
  const region = () => ({
    initialStateIndex: 0,
    states: [
      { kind: StatechartAtomicStateKind, transitions: [triggerTransition] },
      { kind: StatechartAtomicStateKind, transitions: [] },
    ],
  });
  return {
    inputs: [{ initialValue: 0, kind: StatechartInputKind.Trigger, name: 'go' }],
    regions: [region(), region()],
  };
}

function transition(
  targetStateIndex: number,
  conditions: readonly StatechartCondition[] = [],
  options: Partial<Pick<StatechartTransition, 'durationMs' | 'exitTimeRatio'>> = {},
): StatechartTransition {
  return {
    conditions,
    durationMs: options.durationMs ?? 0,
    exitTimeRatio: options.exitTimeRatio ?? -1,
    targetStateIndex,
  };
}
describe('setStatechartRegionDuration', () => {
  it('sets the plain per-region exit-time denominator', () => {
    const instance = createStatechartInstance(createEmptyChart());
    setStatechartRegionDuration(instance, 0, 250);
    expect(instance.regionDuration[0]).toBe(250);
  });

  it('accepts zero as an explicit unavailable duration', () => {
    const instance = createStatechartInstance(createEmptyChart());
    setStatechartRegionDuration(instance, 0, 0);
    expect(instance.regionDuration[0]).toBe(0);
  });

  it('throws for an invalid region or invalid duration', () => {
    const instance = createStatechartInstance(createEmptyChart());
    expect(() => setStatechartRegionDuration(instance, 1, 1)).toThrow(RangeError);
    expect(() => setStatechartRegionDuration(instance, 0, -1)).toThrow(RangeError);
    expect(() => setStatechartRegionDuration(instance, 0, Number.NaN)).toThrow(RangeError);
  });
});
