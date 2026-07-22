import { EntityRuntimeKey } from '@flighthq/types';

import {
  addAnimationSample,
  accumulateAnimationSample,
  blendAnimationSamples,
  createAnimationSampleAccumulator,
  finishAnimationSample,
  resetAnimationSampleAccumulator,
} from './animationBlend';

describe('accumulateAnimationSample', () => {
  it('adds positive weighted samples and ignores zero/negative weights', () => {
    const accumulator = createAnimationSampleAccumulator(2);
    accumulateAnimationSample(accumulator, [2, 4], 2);
    accumulateAnimationSample(accumulator, [100, 100], 0);
    expect(Array.from(accumulator.values)).toEqual([4, 8]);
    expect(accumulator.weight).toBe(2);
  });

  it('aligns equivalent quaternion hemispheres instead of cancelling q and -q', () => {
    const accumulator = createAnimationSampleAccumulator(4, true);
    accumulateAnimationSample(accumulator, [0, 0, Math.SQRT1_2, Math.SQRT1_2], 1);
    accumulateAnimationSample(accumulator, [0, 0, -Math.SQRT1_2, -Math.SQRT1_2], 1);
    const out = [0, 0, 0, 0];
    expect(finishAnimationSample(out, accumulator)).toBe(true);
    expect(out[2]).toBeCloseTo(Math.SQRT1_2);
    expect(out[3]).toBeCloseTo(Math.SQRT1_2);
  });
});

describe('addAnimationSample', () => {
  it('adds weighted scalar/vector deltas and supports output aliasing', () => {
    const out = [1, 2, 3];
    addAnimationSample(out, out, [2, -2, 4], 0.5);
    expect(out).toEqual([2, 1, 5]);
  });

  it('multiplies a weighted quaternion delta onto the base', () => {
    const halfTurnZ = [0, 0, 1, 0];
    const out = [0, 0, 0, 0];
    addAnimationSample(out, [0, 0, 0, 1], halfTurnZ, 0.5, true);
    expect(out[2]).toBeCloseTo(Math.SQRT1_2);
    expect(out[3]).toBeCloseTo(Math.SQRT1_2);
  });
});

describe('blendAnimationSamples', () => {
  it('linearly blends components and clamps alpha', () => {
    const out = [0, 0];
    blendAnimationSamples(out, [0, 10], [10, 20], 0.25);
    expect(out).toEqual([2.5, 12.5]);
    blendAnimationSamples(out, [0, 10], [10, 20], 2);
    expect(out).toEqual([10, 20]);
  });

  it('slerps quaternions over the shortest arc', () => {
    const out = [0, 0, 0, 0];
    blendAnimationSamples(out, [0, 0, 0, 1], [0, 0, -1, 0], 0.5, true);
    expect(Math.abs(out[2])).toBeCloseTo(Math.SQRT1_2);
    expect(Math.abs(out[3])).toBeCloseTo(Math.SQRT1_2);
  });
});

describe('createAnimationSampleAccumulator', () => {
  it('creates an Entity with an owned zeroed component buffer', () => {
    const accumulator = createAnimationSampleAccumulator(3);
    expect(EntityRuntimeKey in accumulator).toBe(true);
    expect(accumulator.components).toBe(3);
    expect(Array.from(accumulator.values)).toEqual([0, 0, 0]);
    expect(accumulator.weight).toBe(0);
  });
});

describe('finishAnimationSample', () => {
  it('normalizes scalar/vector sums by total weight', () => {
    const accumulator = createAnimationSampleAccumulator(2);
    accumulateAnimationSample(accumulator, [0, 10], 1);
    accumulateAnimationSample(accumulator, [10, 20], 3);
    const out = [0, 0];
    expect(finishAnimationSample(out, accumulator)).toBe(true);
    expect(out).toEqual([7.5, 17.5]);
  });

  it('returns false and preserves output for an empty accumulator', () => {
    const out = [7];
    expect(finishAnimationSample(out, createAnimationSampleAccumulator(1))).toBe(false);
    expect(out).toEqual([7]);
  });
});

describe('resetAnimationSampleAccumulator', () => {
  it('clears state while retaining the owned buffer', () => {
    const accumulator = createAnimationSampleAccumulator(2);
    const values = accumulator.values;
    accumulateAnimationSample(accumulator, [2, 4], 1);
    resetAnimationSampleAccumulator(accumulator);
    expect(accumulator.values).toBe(values);
    expect(Array.from(values)).toEqual([0, 0]);
    expect(accumulator.weight).toBe(0);
  });
});
