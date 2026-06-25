import {
  computeOutlineEdgeParams,
  computeOutlineThicknessPx,
  computeSketchEdgeParams,
  getSobelKernelCoefficients,
} from './edgeDetectMath';
import { createOutlineEffect } from './outlineEffect';
import { createSketchEffect } from './sketchEffect';

describe('computeOutlineEdgeParams', () => {
  it('writes threshold, feather, and color into out', () => {
    const out: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
    computeOutlineEdgeParams(createOutlineEffect({ threshold: 0.2, color: 0xff0000ff }), out);
    expect(out[0]).toBeCloseTo(0.2, 6); // threshold
    expect(out[1]).toBeCloseTo(0.1, 6); // feather = threshold * 0.5
    expect(out[2]).toBeCloseTo(1, 5); // r
    expect(out[3]).toBeCloseTo(0, 5); // g
    expect(out[4]).toBeCloseTo(0, 5); // b
    expect(out[5]).toBeCloseTo(1, 5); // a
  });
  it('defaults to black outline', () => {
    const out: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
    computeOutlineEdgeParams(createOutlineEffect(), out);
    expect(out[2]).toBeCloseTo(0, 5); // r
    expect(out[3]).toBeCloseTo(0, 5); // g
    expect(out[4]).toBeCloseTo(0, 5); // b
    expect(out[5]).toBeCloseTo(1, 5); // a
  });
});

describe('computeOutlineThicknessPx', () => {
  it('returns default 1', () => {
    expect(computeOutlineThicknessPx(createOutlineEffect())).toBe(1);
  });
  it('rounds to integer', () => {
    expect(computeOutlineThicknessPx(createOutlineEffect({ thickness: 2.7 }))).toBe(3);
  });
});

describe('computeSketchEdgeParams', () => {
  it('writes threshold inversely proportional to strength', () => {
    const out: [number, number] = [0, 0];
    computeSketchEdgeParams(createSketchEffect({ strength: 1 }), out);
    const threshold1 = out[0];
    computeSketchEdgeParams(createSketchEffect({ strength: 0.5 }), out);
    const threshold05 = out[0];
    expect(threshold05).toBeGreaterThan(threshold1);
  });
  it('strength=1 produces minimum threshold', () => {
    const out: [number, number] = [0, 0];
    computeSketchEdgeParams(createSketchEffect({ strength: 1 }), out);
    expect(out[0]).toBeCloseTo(0.05, 2);
    expect(out[1]).toBe(1);
  });
  it('strength=0 produces threshold at or near 1', () => {
    const out: [number, number] = [0, 0];
    computeSketchEdgeParams(createSketchEffect({ strength: 0 }), out);
    expect(out[0]).toBeCloseTo(1, 5);
    expect(out[1]).toBe(0);
  });
});

describe('getSobelKernelCoefficients', () => {
  it('writes 18 coefficients', () => {
    const out = new Float32Array(18);
    getSobelKernelCoefficients(out);
    // Gx center column is 0
    expect(out[1]).toBe(0);
    expect(out[4]).toBe(0);
    expect(out[7]).toBe(0);
    // Gy center row is 0
    expect(out[12]).toBe(0);
    expect(out[13]).toBe(0);
    expect(out[14]).toBe(0);
  });
  it('Gx and Gy are antisymmetric', () => {
    const out = new Float32Array(18);
    getSobelKernelCoefficients(out);
    // Gx[0,0] = -Gx[0,2]
    expect(out[0]).toBe(-out[2]);
    // Gy[0,0] = -Gy[2,0]
    expect(out[9]).toBe(-out[15]);
  });
});
