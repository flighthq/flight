import { describe, expect, it } from 'vitest';

import {
  createStatechartFloat32Array,
  createStatechartFloat64Array,
  createStatechartInt32Array,
} from './statechartTypedArrays.ts';

describe('createStatechartFloat32Array', () => {
  it('allocates a zeroed Float32Array', () => {
    expect(createStatechartFloat32Array(2)).toEqual(new Float32Array([0, 0]));
  });
});

describe('createStatechartFloat64Array', () => {
  it('allocates a zeroed Float64Array', () => {
    expect(createStatechartFloat64Array(2)).toEqual(new Float64Array([0, 0]));
  });
});

describe('createStatechartInt32Array', () => {
  it('allocates and fills an Int32Array', () => {
    expect(createStatechartInt32Array(2, -1)).toEqual(new Int32Array([-1, -1]));
  });
});
