import { allocateEntity } from '@flighthq/entity/contract';
import { describe, expect, it } from 'vitest';

import { initializeStatechartInstanceFields } from './statechartInstanceFields.ts';
import type { Statechart, StatechartInstance } from './types.ts';

describe('initializeStatechartInstanceFields', () => {
  it('installs caller-owned buffers and clears nullable runtime slots', () => {
    const out = allocateEntity<StatechartInstance>();
    const chart: Statechart = { inputs: [], regions: [] };
    const inputValues = new Float64Array(1);
    const regionBlend = new Float32Array(1);
    const regionDuration = new Float64Array(1);
    const regionElapsed = new Float64Array(1);
    const regionStates = new Int32Array([2]);
    const regionTransitions = new Int32Array([-1]);

    initializeStatechartInstanceFields(
      out as StatechartInstance,
      chart,
      inputValues,
      regionBlend,
      regionDuration,
      regionElapsed,
      regionStates,
      regionTransitions,
    );

    expect(out.chart).toBe(chart);
    expect(out.inputValues).toBe(inputValues);
    expect(out.regionStates).toBe(regionStates);
    expect(out.regionTransitions).toBe(regionTransitions);
    expect(out.durationGuard).toBeNull();
    expect(out.signals).toBeNull();
  });
});
