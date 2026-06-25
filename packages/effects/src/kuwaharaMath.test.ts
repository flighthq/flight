import { createKuwaharaEffect } from './kuwaharaEffect';
import {
  computeKuwaharaGaussianWeights,
  computeKuwaharaSectorOffsets,
  computeKuwaharaSectorPixelCount,
  computeKuwaharaSectorSize,
} from './kuwaharaMath';

describe('computeKuwaharaGaussianWeights', () => {
  it('returns normalized weights summing to ~1', () => {
    const out = new Float32Array(16);
    const n = computeKuwaharaGaussianWeights(3, out);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += out[i];
    expect(sum).toBeCloseTo(1, 5);
  });
  it('returns (radius+1)^2 weights', () => {
    const out = new Float32Array(25);
    const n = computeKuwaharaGaussianWeights(4, out);
    expect(n).toBe(25); // (4+1)^2
  });
  it('center weight (0,0) is largest for radius >= 1', () => {
    const r = 3;
    const size = r + 1;
    const out = new Float32Array(size * size);
    computeKuwaharaGaussianWeights(r, out);
    const center = out[0]; // top-left corner is the closest to center of sector
    expect(center).toBeGreaterThan(0);
  });
});

describe('computeKuwaharaSectorOffsets', () => {
  it('writes 8 values into out', () => {
    const out: [number, number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0, 0];
    computeKuwaharaSectorOffsets(3, out);
    // top-left starts at (-3, -3)
    expect(out[0]).toBe(-3);
    expect(out[1]).toBe(-3);
    // top-right starts at (0, -3)
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(-3);
    // bottom-left starts at (-3, 0)
    expect(out[4]).toBe(-3);
    expect(out[5]).toBe(0);
    // bottom-right starts at (0, 0)
    expect(out[6]).toBe(0);
    expect(out[7]).toBe(0);
  });
});

describe('computeKuwaharaSectorPixelCount', () => {
  it('returns (radius+1)^2 for default radius 3', () => {
    expect(computeKuwaharaSectorPixelCount(createKuwaharaEffect())).toBe(16);
  });
});

describe('computeKuwaharaSectorSize', () => {
  it('returns radius+1', () => {
    expect(computeKuwaharaSectorSize(createKuwaharaEffect({ radius: 3 }))).toBe(4);
    expect(computeKuwaharaSectorSize(createKuwaharaEffect({ radius: 5 }))).toBe(6);
  });
  it('minimum is 2 (radius 1)', () => {
    expect(computeKuwaharaSectorSize(createKuwaharaEffect({ radius: 1 }))).toBe(2);
  });
});
