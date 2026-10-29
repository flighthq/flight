// Generated from crates/flight-statechart/tests/statechart_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  StatechartAtomicStateKind,
  StatechartNestedStateKind,
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
} from './contract.ts';
import type {
  StatechartComparison,
  StatechartCondition,
  StatechartInput,
  StatechartInstanceRaw,
  StatechartRaw,
  StatechartRegion,
  StatechartState,
  StatechartTransition,
  StatechartTransitionExplanation,
} from './contract.ts';

function createInstance(chart: Readonly<StatechartRaw>): StatechartInstanceRaw {
  const chartRef = chart;
  return createStatechartInstance(chartRef);
}

function condition(inputIndex: number, comparison: StatechartComparison, value: number): StatechartCondition {
  return { comparison: comparison, inputIndex: inputIndex, value: value };
}

function createEmptyChart(): StatechartRaw {
  return {
    inputs: [],
    name: undefined,
    regions: [
      {
        initialStateIndex: 0,
        name: undefined,
        states: [{ kind: String(StatechartAtomicStateKind), name: undefined, transitions: [] }],
      },
    ],
  };
}

function createSingleTransitionChart(
  inputs: StatechartInput[],
  conditions: StatechartCondition[],
  durationMs: number,
  exitTimeRatio: number,
): StatechartRaw {
  return {
    inputs: inputs,
    name: undefined,
    regions: [
      {
        initialStateIndex: 0,
        name: undefined,
        states: [
          {
            kind: String(StatechartAtomicStateKind),
            name: undefined,
            transitions: [transition(1, conditions, durationMs, exitTimeRatio)],
          },
          { kind: String(StatechartAtomicStateKind), name: undefined, transitions: [] },
        ],
      },
    ],
  };
}

function createTwoRegionTriggerChart(): StatechartRaw {
  const triggerTransition = transition(1, [condition(0, 'GreaterThan', 999.0)], 0.0, -1.0);
  return {
    inputs: [{ initialValue: 0.0, kind: 'Trigger', name: 'go' }],
    name: undefined,
    regions: [createTriggerRegion(triggerTransition), createTriggerRegion(triggerTransition)],
  };
}

function createTriggerRegion(transition: StatechartTransition): StatechartRegion {
  return {
    initialStateIndex: 0,
    name: undefined,
    states: [
      { kind: String(StatechartAtomicStateKind), name: undefined, transitions: [transition] },
      { kind: String(StatechartAtomicStateKind), name: undefined, transitions: [] },
    ],
  };
}

function transition(
  targetStateIndex: number,
  conditions: StatechartCondition[],
  durationMs: number,
  exitTimeRatio: number,
): StatechartTransition {
  return {
    conditions: conditions,
    durationMs: durationMs,
    exitTimeRatio: exitTimeRatio,
    targetStateIndex: targetStateIndex,
  };
}

describe('advanceStatechartInstance', () => {
  it('advances every concurrent region before clearing a shared trigger', () => {
    const chart = createTwoRegionTriggerChart();
    const instance = createInstance(chart);
    fireStatechartTrigger(instance, 0);
    expect(advanceStatechartInstance(instance, 0.0)).toEqual(2);
    expect(instance!.regionStates.length).toEqual(2);
    expect(instance!.regionStates[0]).toEqual(1);
    expect(instance!.regionStates[1]).toEqual(1);
    expect(instance!.inputValues[0]).toEqual(0.0);
  });
  it('requires all data only conditions and selects the first eligible transition', () => {
    const chart: StatechartRaw = {
      inputs: [
        { initialValue: 0.0, kind: 'Boolean', name: 'armed' },
        { initialValue: 2.0, kind: 'Number', name: 'speed' },
      ],
      name: undefined,
      regions: [
        {
          initialStateIndex: 0,
          name: undefined,
          states: [
            {
              kind: String(StatechartAtomicStateKind),
              name: undefined,
              transitions: [
                transition(1, [condition(0, 'Equal', 1.0)], 0.0, -1.0),
                transition(2, [condition(0, 'Equal', 0.0), condition(1, 'GreaterThan', 4.0)], 0.0, -1.0),
                transition(1, [condition(0, 'Equal', 0.0), condition(1, 'LessThanOrEqual', 2.0)], 0.0, -1.0),
              ],
            },
            { kind: String(StatechartAtomicStateKind), name: undefined, transitions: [] },
            { kind: String(StatechartAtomicStateKind), name: undefined, transitions: [] },
          ],
        },
      ],
    } as const;
    const instance = createInstance(chart);
    expect(advanceStatechartInstance(instance, 0.0)).toEqual(1);
    expect(instance!.regionStates[0]).toEqual(1);
  });
  it('evaluates equal numeric comparison', () => {
    const chart = createSingleTransitionChart(
      [{ initialValue: 3.0, kind: 'Number', name: undefined }],
      [condition(0, 'Equal', 3.0)],
      0.0,
      -1.0,
    );
    expect(advanceStatechartInstance(createInstance(chart), 0.0) === 1).toEqual(true);
  });
  it('evaluates greater than numeric comparison', () => {
    const chart = createSingleTransitionChart(
      [{ initialValue: 3.0, kind: 'Number', name: undefined }],
      [condition(0, 'GreaterThan', 2.0)],
      0.0,
      -1.0,
    );
    expect(advanceStatechartInstance(createInstance(chart), 0.0) === 1).toEqual(true);
  });
  it('evaluates greater than or equal numeric comparison', () => {
    const chart = createSingleTransitionChart(
      [{ initialValue: 3.0, kind: 'Number', name: undefined }],
      [condition(0, 'GreaterThanOrEqual', 3.0)],
      0.0,
      -1.0,
    );
    expect(advanceStatechartInstance(createInstance(chart), 0.0) === 1).toEqual(true);
  });
  it('evaluates less than numeric comparison', () => {
    const chart = createSingleTransitionChart(
      [{ initialValue: 3.0, kind: 'Number', name: undefined }],
      [condition(0, 'LessThan', 4.0)],
      0.0,
      -1.0,
    );
    expect(advanceStatechartInstance(createInstance(chart), 0.0) === 1).toEqual(true);
  });
  it('evaluates less than or equal numeric comparison', () => {
    const chart = createSingleTransitionChart(
      [{ initialValue: 3.0, kind: 'Number', name: undefined }],
      [condition(0, 'LessThanOrEqual', 3.0)],
      0.0,
      -1.0,
    );
    expect(advanceStatechartInstance(createInstance(chart), 0.0) === 1).toEqual(true);
  });
  it('evaluates not equal numeric comparison', () => {
    const chart = createSingleTransitionChart(
      [{ initialValue: 3.0, kind: 'Number', name: undefined }],
      [condition(0, 'NotEqual', 4.0)],
      0.0,
      -1.0,
    );
    expect(advanceStatechartInstance(createInstance(chart), 0.0) === 1).toEqual(true);
  });
  it('reports blend progress without performing composition and changes state at completion', () => {
    const chart = createSingleTransitionChart([] as never[], [] as never[], 100.0, -1.0);
    const instance = createInstance(chart);
    expect(advanceStatechartInstance(instance, 40.0)).toEqual(0);
    expect(instance!.regionStates[0]).toEqual(0);
    expect(Math.abs(getStatechartRegionBlend(instance, 0) - 0.4) < 0.001).toBe(true);
    expect(advanceStatechartInstance(instance, 60.0)).toEqual(1);
    expect(instance!.regionStates[0]).toEqual(1);
    expect(getStatechartRegionBlend(instance, 0)).toEqual(0.0);
  });
  it('accumulates elapsed time and evaluates exit time ratio against caller supplied duration', () => {
    const chart = createSingleTransitionChart([] as never[], [] as never[], 0.0, 0.5);
    const instance = createInstance(chart);
    setStatechartRegionDuration(instance, 0, 100.0);
    expect(advanceStatechartInstance(instance, 49.0)).toEqual(0);
    expect(instance!.regionElapsed[0]).toEqual(49.0);
    expect(advanceStatechartInstance(instance, 1.0)).toEqual(1);
    expect(instance!.regionStates[0]).toEqual(1);
    expect(instance!.regionElapsed[0]).toEqual(0.0);
    expect(instance!.regionDuration[0]).toEqual(0.0);
  });
  it('changes a region at most once per call even when the target has an immediate transition', () => {
    const chart: StatechartRaw = {
      inputs: [],
      name: undefined,
      regions: [
        {
          initialStateIndex: 0,
          name: undefined,
          states: [
            {
              kind: String(StatechartAtomicStateKind),
              name: undefined,
              transitions: [transition(1, [] as never[], 0.0, -1.0)],
            },
            {
              kind: String(StatechartAtomicStateKind),
              name: undefined,
              transitions: [transition(2, [] as never[], 0.0, -1.0)],
            },
            { kind: String(StatechartAtomicStateKind), name: undefined, transitions: [] },
          ],
        },
      ],
    };
    const instance = createInstance(chart);
    expect(advanceStatechartInstance(instance, 0.0)).toEqual(1);
    expect(instance!.regionStates[0]).toEqual(1);
    expect(advanceStatechartInstance(instance, 0.0)).toEqual(1);
    expect(instance!.regionStates[0]).toEqual(2);
  });
  it('treats non positive and non finite time as no blend progress', () => {
    const chart = createSingleTransitionChart([] as never[], [] as never[], 100.0, -1.0);
    const instance = createInstance(chart);
    expect(advanceStatechartInstance(instance, -1.0)).toEqual(0);
    expect(advanceStatechartInstance(instance, Number.NaN)).toEqual(0);
    expect(instance!.regionBlend[0]).toEqual(0.0);
  });
});

describe('createStatechartInstance', () => {
  it('creates independent typed array actor state while retaining the immutable chart', () => {
    const chart: StatechartRaw = {
      inputs: [
        { initialValue: -2.0, kind: 'Boolean', name: undefined },
        { initialValue: 3.5, kind: 'Number', name: undefined },
        { initialValue: 0.0, kind: 'Trigger', name: undefined },
      ],
      name: 'shared',
      regions: [
        {
          initialStateIndex: 1,
          name: undefined,
          states: [
            { kind: String(StatechartNestedStateKind), name: undefined, transitions: [] },
            { kind: 'acme.CustomState', name: undefined, transitions: [] },
          ],
        },
      ],
    } as const;
    const chartRef = chart;
    const first = createStatechartInstance(chartRef);
    const second = createStatechartInstance(chartRef);
    expect(first!.chart === chartRef).toBe(true);
    expect(second!.chart === chartRef).toBe(true);
    expect(first!.inputValues.length).toEqual(3);
    expect(first!.inputValues[0]).toEqual(1.0);
    expect(first!.inputValues[1]).toEqual(3.5);
    expect(first!.inputValues[2]).toEqual(0.0);
    expect(first!.regionBlend.length).toEqual(1);
    expect(first!.regionDuration.length).toEqual(1);
    expect(first!.regionElapsed.length).toEqual(1);
    expect(first!.regionStates.length).toEqual(1);
    expect(first!.regionTransitions.length).toEqual(1);
    expect(first!.regionStates[0]).toEqual(1);
    expect(first!.regionTransitions[0]).toEqual(-1);
    first!.inputValues[1] = 9.0;
    expect(second!.inputValues[1]).toEqual(3.5);
  });
  it('rejects malformed authored indices as programmer errors', () => {
    expect(() => {
      const chart: StatechartRaw = {
        inputs: [],
        name: undefined,
        regions: [
          {
            initialStateIndex: 1,
            name: undefined,
            states: [{ kind: String(StatechartAtomicStateKind), name: undefined, transitions: [] }],
          },
        ],
      };
      createInstance(chart);
    }).toThrow();
  });
  it('accepts nested and vendor prefixed state kinds without closed dispatch', () => {
    const chart: StatechartRaw = {
      inputs: [],
      name: undefined,
      regions: [
        {
          initialStateIndex: 0,
          name: undefined,
          states: [
            { kind: String(StatechartNestedStateKind), name: undefined, transitions: [] },
            { kind: 'vendor.Special', name: undefined, transitions: [] },
          ],
        },
      ],
    };
    createInstance(chart);
  });
});

describe('explainStatechartTransition', () => {
  it('returns an invalid region diagnostic for the silent getter sentinel', () => {
    const explanation = explainStatechartTransition(createInstance(createEmptyChart()), 4);
    expect(explanation).toEqual({
      blend: -1.0,
      conditionIndex: -1,
      regionIndex: 4,
      sourceStateIndex: -1,
      status: 'InvalidRegion',
      targetStateIndex: -1,
      transitionIndex: -1,
    });
  });
  it('reports a state with no transitions', () => {
    const explanation = explainStatechartTransition(createInstance(createEmptyChart()), 0);
    expect(explanation.status).toEqual('NoTransitions');
    expect(explanation.transitionIndex).toEqual(-1);
  });
  it('identifies the first unmet condition', () => {
    const chart = createSingleTransitionChart(
      [{ initialValue: 0.0, kind: 'Number', name: undefined }],
      [condition(0, 'GreaterThan', 2.0)],
      0.0,
      -1.0,
    );
    const explanation = explainStatechartTransition(createInstance(chart), 0);
    expect(explanation.status).toEqual('ConditionsUnmet');
    expect(explanation.conditionIndex).toEqual(0);
    expect(explanation.targetStateIndex).toEqual(1);
  });
  it('reports ready and transitioning states without mutation', () => {
    const chart = createSingleTransitionChart([] as never[], [] as never[], 100.0, -1.0);
    const instance = createInstance(chart);
    expect(explainStatechartTransition(instance, 0).status).toEqual('Ready');
    advanceStatechartInstance(instance, 25.0);
    const explanation = explainStatechartTransition(instance, 0);
    expect(explanation.status).toEqual('Transitioning');
    expect(Math.abs(explanation.blend - 0.25) < 0.001).toBe(true);
    expect(explanation.transitionIndex).toEqual(0);
  });
  it('reports a satisfied guard waiting on exit time', () => {
    const chart = createSingleTransitionChart([] as never[], [] as never[], 0.0, 0.5);
    const instance = createInstance(chart);
    setStatechartRegionDuration(instance, 0, 100.0);
    const explanation = explainStatechartTransition(instance, 0);
    expect(explanation.status).toEqual('ExitTimePending');
    expect(explanation.conditionIndex).toEqual(-1);
  });
  it('reports a missing duration that runtime coerces to no exit time requirement', () => {
    const chart = createSingleTransitionChart([] as never[], [] as never[], 0.0, 0.5);
    const explanation = explainStatechartTransition(createInstance(chart), 0);
    expect(explanation.status).toEqual('MissingRegionDuration');
    expect(explanation.transitionIndex).toEqual(0);
  });
});

describe('fireStatechartTrigger', () => {
  it('latches a trigger until all regions see the next advance and ignores condition value', () => {
    const instance = createInstance(createTwoRegionTriggerChart());
    fireStatechartTrigger(instance, 0);
    expect(instance!.inputValues[0]).toEqual(1.0);
    expect(advanceStatechartInstance(instance, 0.0)).toEqual(2);
    expect(instance!.inputValues[0]).toEqual(0.0);
  });
  it('throws for an invalid index', () => {
    expect(() => {
      const chart = createSingleTransitionChart(
        [{ initialValue: 0.0, kind: 'Number', name: undefined }],
        [] as never[],
        0.0,
        -1.0,
      );
      const instance = createInstance(chart);
      fireStatechartTrigger(instance, -1);
    }).toThrow();
  });
  it('throws for non trigger input', () => {
    expect(() => {
      const chart = createSingleTransitionChart(
        [{ initialValue: 0.0, kind: 'Number', name: undefined }],
        [] as never[],
        0.0,
        -1.0,
      );
      const instance = createInstance(chart);
      fireStatechartTrigger(instance, 0);
    }).toThrow();
  });
});

describe('getStatechartInputIndex', () => {
  it('returns the first matching input index and negative one when absent', () => {
    const chart: StatechartRaw = {
      inputs: [
        { initialValue: 0.0, kind: 'Number', name: 'speed' },
        { initialValue: 1.0, kind: 'Number', name: 'speed' },
      ],
      name: undefined,
      regions: [],
    } as const;
    expect(getStatechartInputIndex(chart, 'speed')).toEqual(0);
    expect(getStatechartInputIndex(chart, 'missing')).toEqual(-1);
  });
});

describe('getStatechartRegionBlend', () => {
  it('returns a region blend and negative one for invalid regions', () => {
    const instance = createInstance(createEmptyChart());
    instance!.regionBlend[0] = 0.4;
    expect(Math.abs(getStatechartRegionBlend(instance, 0) - 0.4) < 0.001).toBe(true);
    expect(getStatechartRegionBlend(instance, -1)).toEqual(-1.0);
    expect(getStatechartRegionBlend(instance, 1)).toEqual(-1.0);
  });
});

describe('getStatechartRegionState', () => {
  it('returns a region state and negative one for invalid regions', () => {
    const instance = createInstance(createEmptyChart());
    expect(getStatechartRegionState(instance, 0)).toEqual(0);
    expect(getStatechartRegionState(instance, -1)).toEqual(-1);
    expect(getStatechartRegionState(instance, 1)).toEqual(-1);
  });
});

describe('initializeStatechartInstancePortable', () => {
  it('backs the public constructor with initialized region state', () => {
    const instance = createStatechartInstance(createEmptyChart());
    expect(instance!.regionStates[0]).toEqual(0);
    expect(instance!.regionTransitions[0]).toEqual(-1);
  });
});

describe('setStatechartBooleanInput', () => {
  it('writes the boolean input vocabulary as numeric 0 1', () => {
    const chart = createSingleTransitionChart(
      [{ initialValue: 0.0, kind: 'Boolean', name: undefined }],
      [] as never[],
      0.0,
      -1.0,
    );
    const instance = createInstance(chart);
    setStatechartBooleanInput(instance, 0, true);
    expect(instance!.inputValues[0]).toEqual(1.0);
    setStatechartBooleanInput(instance, 0, false);
    expect(instance!.inputValues[0]).toEqual(0.0);
  });
  it('throws for an invalid index', () => {
    expect(() => {
      const chart = createSingleTransitionChart(
        [{ initialValue: 0.0, kind: 'Number', name: undefined }],
        [] as never[],
        0.0,
        -1.0,
      );
      const instance = createInstance(chart);
      setStatechartBooleanInput(instance, 1, true);
    }).toThrow();
  });
  it('throws for non boolean input', () => {
    expect(() => {
      const chart = createSingleTransitionChart(
        [{ initialValue: 0.0, kind: 'Number', name: undefined }],
        [] as never[],
        0.0,
        -1.0,
      );
      const instance = createInstance(chart);
      setStatechartBooleanInput(instance, 0, true);
    }).toThrow();
  });
});

describe('setStatechartNumberInput', () => {
  it('writes an exact numeric value', () => {
    const chart = createSingleTransitionChart(
      [{ initialValue: 0.0, kind: 'Number', name: undefined }],
      [] as never[],
      0.0,
      -1.0,
    );
    const instance = createInstance(chart);
    setStatechartNumberInput(instance, 0, -3.25);
    expect(instance!.inputValues[0]).toEqual(-3.25);
  });
  it('throws for an invalid index', () => {
    expect(() => {
      const chart = createSingleTransitionChart(
        [{ initialValue: 0.0, kind: 'Boolean', name: undefined }],
        [] as never[],
        0.0,
        -1.0,
      );
      const instance = createInstance(chart);
      setStatechartNumberInput(instance, 1, 2.0);
    }).toThrow();
  });
  it('throws for non number input', () => {
    expect(() => {
      const chart = createSingleTransitionChart(
        [{ initialValue: 0.0, kind: 'Boolean', name: undefined }],
        [] as never[],
        0.0,
        -1.0,
      );
      const instance = createInstance(chart);
      setStatechartNumberInput(instance, 0, 2.0);
    }).toThrow();
  });
});

describe('setStatechartRegionDuration', () => {
  it('sets the plain per region exit time denominator', () => {
    const instance = createInstance(createEmptyChart());
    setStatechartRegionDuration(instance, 0, 250.0);
    expect(instance!.regionDuration[0]).toEqual(250.0);
  });
  it('accepts zero as an explicit unavailable duration', () => {
    const instance = createInstance(createEmptyChart());
    setStatechartRegionDuration(instance, 0, 0.0);
    expect(instance!.regionDuration[0]).toEqual(0.0);
  });
  it('throws for an invalid region', () => {
    expect(() => {
      const instance = createInstance(createEmptyChart());
      setStatechartRegionDuration(instance, 1, 1.0);
    }).toThrow();
  });
  it('throws for negative duration', () => {
    expect(() => {
      const instance = createInstance(createEmptyChart());
      setStatechartRegionDuration(instance, 0, -1.0);
    }).toThrow();
  });
  it('throws for nan duration', () => {
    expect(() => {
      const instance = createInstance(createEmptyChart());
      setStatechartRegionDuration(instance, 0, Number.NaN);
    }).toThrow();
  });
});
