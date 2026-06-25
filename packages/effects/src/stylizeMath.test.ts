import {
  computeCrtMaskParams,
  computeHalftoneCellParams,
  computeScanlineParams,
  createBayerMatrix,
} from './stylizeMath';

describe('computeCrtMaskParams', () => {
  it('writes two values', () => {
    const out: [number, number] = [0, 0];
    computeCrtMaskParams(720, 0.5, out);
    expect(typeof out[0]).toBe('number');
    expect(typeof out[1]).toBe('number');
  });
  it('higher resolution produces larger mask scale', () => {
    const out1: [number, number] = [0, 0];
    const out2: [number, number] = [0, 0];
    computeCrtMaskParams(360, 0, out1);
    computeCrtMaskParams(720, 0, out2);
    expect(out2[0]).toBeGreaterThan(out1[0]);
  });
  it('curvature is clamped to [0, 0.1]', () => {
    const out: [number, number] = [0, 0];
    computeCrtMaskParams(360, 2, out);
    expect(out[1]).toBeCloseTo(0.1, 5);
  });
});

describe('computeHalftoneCellParams', () => {
  it('writes cellSize, cosAngle, sinAngle', () => {
    const out: [number, number, number] = [0, 0, 0];
    computeHalftoneCellParams(1 / 8, Math.PI / 4, out);
    expect(out[0]).toBeCloseTo(8, 4);
    expect(out[1]).toBeCloseTo(Math.SQRT1_2, 4);
    expect(out[2]).toBeCloseTo(Math.SQRT1_2, 4);
  });
  it('0 angle produces cos=1, sin=0', () => {
    const out: [number, number, number] = [0, 0, 0];
    computeHalftoneCellParams(1 / 4, 0, out);
    expect(out[1]).toBeCloseTo(1, 5);
    expect(out[2]).toBeCloseTo(0, 5);
  });
});

describe('computeScanlineParams', () => {
  it('writes scale and intensity', () => {
    const out: [number, number] = [0, 0];
    computeScanlineParams(480, 0.5, out);
    expect(out[0]).toBeCloseTo(1, 4);
    expect(out[1]).toBeCloseTo(0.5, 4);
  });
  it('clamps intensity to [0, 1]', () => {
    const out: [number, number] = [0, 0];
    computeScanlineParams(480, 2, out);
    expect(out[1]).toBeCloseTo(1, 5);
  });
});

describe('createBayerMatrix', () => {
  it('returns size 2 for order 1', () => {
    const out = new Float32Array(4);
    const size = createBayerMatrix(1, out);
    expect(size).toBe(2);
  });
  it('returns size 4 for order 2', () => {
    const out = new Float32Array(16);
    const size = createBayerMatrix(2, out);
    expect(size).toBe(4);
  });
  it('all values are in [0, 1)', () => {
    const out = new Float32Array(16);
    const size = createBayerMatrix(2, out);
    for (let i = 0; i < size * size; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(0);
      expect(out[i]).toBeLessThan(1);
    }
  });
  it('all values in 2x2 matrix are unique', () => {
    const out = new Float32Array(4);
    createBayerMatrix(1, out);
    const unique = new Set(Array.from(out));
    expect(unique.size).toBe(4);
  });
  it('all values in 4x4 matrix are unique', () => {
    const out = new Float32Array(16);
    createBayerMatrix(2, out);
    const unique = new Set(Array.from(out));
    expect(unique.size).toBe(16);
  });
  it('is deterministic', () => {
    const out1 = new Float32Array(16);
    const out2 = new Float32Array(16);
    createBayerMatrix(2, out1);
    createBayerMatrix(2, out2);
    for (let i = 0; i < 16; i++) {
      expect(out1[i]).toBeCloseTo(out2[i], 5);
    }
  });
});
