import { computeLookupTableCoord, getLookupTableTileLayout } from './lutMath';

describe('computeLookupTableCoord', () => {
  it('writes two values into out', () => {
    const out: [number, number] = [0, 0];
    computeLookupTableCoord(0.5, 0.5, 0.5, 16, out);
    expect(typeof out[0]).toBe('number');
    expect(typeof out[1]).toBe('number');
  });
  it('black (0,0,0) maps to near (0, 0)', () => {
    const out: [number, number] = [0, 0];
    computeLookupTableCoord(0, 0, 0, 16, out);
    expect(out[0]).toBeGreaterThanOrEqual(0);
    expect(out[1]).toBeGreaterThanOrEqual(0);
  });
  it('U and V are in [0, 1] range for valid input', () => {
    const out: [number, number] = [0, 0];
    computeLookupTableCoord(0.5, 0.5, 0.5, 16, out);
    expect(out[0]).toBeGreaterThanOrEqual(0);
    expect(out[0]).toBeLessThanOrEqual(1);
    expect(out[1]).toBeGreaterThanOrEqual(0);
    expect(out[1]).toBeLessThanOrEqual(1);
  });
  it('high G shifts V up', () => {
    const outLow: [number, number] = [0, 0];
    const outHigh: [number, number] = [0, 0];
    computeLookupTableCoord(0.5, 0.1, 0.5, 16, outLow);
    computeLookupTableCoord(0.5, 0.9, 0.5, 16, outHigh);
    expect(outHigh[1]).toBeGreaterThan(outLow[1]);
  });
  it('high B shifts U right', () => {
    const outLow: [number, number] = [0, 0];
    const outHigh: [number, number] = [0, 0];
    computeLookupTableCoord(0.5, 0.5, 0.1, 16, outLow);
    computeLookupTableCoord(0.5, 0.5, 0.9, 16, outHigh);
    expect(outHigh[0]).toBeGreaterThan(outLow[0]);
  });
  it('clamps out-of-range input', () => {
    const out1: [number, number] = [0, 0];
    const out2: [number, number] = [0, 0];
    computeLookupTableCoord(0, 0, 0, 16, out1);
    computeLookupTableCoord(-0.5, -0.5, -0.5, 16, out2);
    expect(out1[0]).toBeCloseTo(out2[0], 5);
    expect(out1[1]).toBeCloseTo(out2[1], 5);
  });
});

describe('getLookupTableTileLayout', () => {
  it('returns [size², size] for a given LUT size', () => {
    const out: [number, number] = [0, 0];
    getLookupTableTileLayout(16, out);
    expect(out[0]).toBe(256); // 16 * 16
    expect(out[1]).toBe(16);
  });
  it('works for size 32', () => {
    const out: [number, number] = [0, 0];
    getLookupTableTileLayout(32, out);
    expect(out[0]).toBe(1024);
    expect(out[1]).toBe(32);
  });
  it('handles size 1 without dividing by zero', () => {
    const out: [number, number] = [0, 0];
    getLookupTableTileLayout(1, out);
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(1);
  });
});
