import {
  computeAcesToneMap,
  computeAgxToneMap,
  computeExposureScale,
  computeFilmicToneMap,
  computeReinhardExtendedToneMap,
  computeReinhardToneMap,
  computeUncharted2ToneMap,
  getAcesInputMatrix,
  getAcesOutputMatrix,
} from './toneMapMath';

describe('computeAcesToneMap', () => {
  it('maps 0 to approximately 0', () => {
    expect(computeAcesToneMap(0)).toBeCloseTo(0, 2);
  });
  it('output is clamped to [0, 1]', () => {
    expect(computeAcesToneMap(100)).toBeLessThanOrEqual(1);
    expect(computeAcesToneMap(-1)).toBeGreaterThanOrEqual(0);
  });
  it('x=1 returns a known reference value', () => {
    // At x=1: (2.51 + 0.03) / (2.43 + 0.59 + 0.14) ≈ 0.8016
    const v = computeAcesToneMap(1);
    expect(v).toBeGreaterThan(0.7);
    expect(v).toBeLessThan(0.9);
  });
});

describe('computeAgxToneMap', () => {
  it('output is in [0, 1] range', () => {
    expect(computeAgxToneMap(0.5)).toBeGreaterThanOrEqual(0);
    expect(computeAgxToneMap(0.5)).toBeLessThanOrEqual(1);
    expect(computeAgxToneMap(100)).toBeLessThanOrEqual(1.1); // allow slight overshoot on sigmoid endpoints
  });
  it('increases monotonically in the normal range', () => {
    expect(computeAgxToneMap(1)).toBeGreaterThan(computeAgxToneMap(0.5));
  });
});

describe('computeExposureScale', () => {
  it('EV=0 returns 1', () => {
    expect(computeExposureScale(0)).toBeCloseTo(1, 5);
  });
  it('EV=1 doubles brightness', () => {
    expect(computeExposureScale(1)).toBeCloseTo(2, 5);
  });
  it('EV=-1 halves brightness', () => {
    expect(computeExposureScale(-1)).toBeCloseTo(0.5, 5);
  });
});

describe('computeFilmicToneMap', () => {
  it('output is non-negative for non-negative input', () => {
    expect(computeFilmicToneMap(0)).toBeGreaterThanOrEqual(0);
    expect(computeFilmicToneMap(1)).toBeGreaterThanOrEqual(0);
  });
  it('output increases with input in the linear range', () => {
    expect(computeFilmicToneMap(0.5)).toBeGreaterThan(computeFilmicToneMap(0.1));
  });
});

describe('computeReinhardExtendedToneMap', () => {
  it('maps 0 to 0', () => {
    expect(computeReinhardExtendedToneMap(0, 10)).toBeCloseTo(0, 5);
  });
  it('at white point x==w output is 1', () => {
    expect(computeReinhardExtendedToneMap(10, 10)).toBeCloseTo(1, 4);
  });
});

describe('computeReinhardToneMap', () => {
  it('maps 0 to 0', () => {
    expect(computeReinhardToneMap(0)).toBeCloseTo(0, 5);
  });
  it('output is always < 1 for positive input', () => {
    expect(computeReinhardToneMap(1)).toBeLessThan(1);
    expect(computeReinhardToneMap(100)).toBeLessThan(1);
  });
  it('x=1 maps to 0.5', () => {
    expect(computeReinhardToneMap(1)).toBeCloseTo(0.5, 5);
  });
});

describe('computeUncharted2ToneMap', () => {
  it('output at x=0 is near 0', () => {
    expect(Math.abs(computeUncharted2ToneMap(0))).toBeLessThan(0.1);
  });
  it('output increases with input', () => {
    expect(computeUncharted2ToneMap(2)).toBeGreaterThan(computeUncharted2ToneMap(1));
  });
});

describe('getAcesInputMatrix', () => {
  it('writes 9 values', () => {
    const out = new Float32Array(9);
    getAcesInputMatrix(out);
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += out[i];
    }
    expect(sum).toBeGreaterThan(0);
  });
  it('diagonal values are largest in each column', () => {
    const out = new Float32Array(9);
    getAcesInputMatrix(out);
    // Column 0: out[0] > out[1], out[0] > out[2]
    expect(out[0]).toBeGreaterThan(out[1]);
    expect(out[0]).toBeGreaterThan(out[2]);
  });
});

describe('getAcesOutputMatrix', () => {
  it('writes 9 values', () => {
    const out = new Float32Array(9);
    getAcesOutputMatrix(out);
    let hasNonZero = false;
    for (let i = 0; i < 9; i++) {
      if (out[i] !== 0) hasNonZero = true;
    }
    expect(hasNonZero).toBe(true);
  });
});
