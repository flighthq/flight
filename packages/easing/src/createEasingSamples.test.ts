import { createEasingSamples } from './createEasingSamples';
import { easeInCubic } from './easeCubic';
import { easeLinear } from './easeLinear';

describe('createEasingSamples', () => {
  it('throws for count < 1', () => {
    expect(() => createEasingSamples(easeLinear, 0)).toThrow();
    expect(() => createEasingSamples(easeLinear, -1)).toThrow();
  });
  it('throws for non-finite count', () => {
    expect(() => createEasingSamples(easeLinear, Infinity)).toThrow();
    expect(() => createEasingSamples(easeLinear, NaN)).toThrow();
  });
  it('allocates a Float32Array when out is omitted', () => {
    const result = createEasingSamples(easeLinear, 5);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(5);
  });
  it('writes into the provided out array and returns it', () => {
    const out = new Float32Array(5);
    const result = createEasingSamples(easeLinear, 5, out);
    expect(result).toBe(out);
  });
  it('first sample is ease(0) and last is ease(1)', () => {
    const result = createEasingSamples(easeInCubic, 11);
    expect(result[0]).toBeCloseTo(easeInCubic(0));
    expect(result[10]).toBeCloseTo(easeInCubic(1));
  });
  it('samples easeLinear uniformly: result[i] ≈ i/(count-1)', () => {
    const count = 6;
    const result = createEasingSamples(easeLinear, count);
    for (let i = 0; i < count; i++) {
      expect(result[i]).toBeCloseTo(i / (count - 1), 5);
    }
  });
  it('count=1 samples at the midpoint (t=0.5)', () => {
    const result = createEasingSamples(easeInCubic, 1);
    expect(result[0]).toBeCloseTo(easeInCubic(0.5));
  });
  it('is alias-safe: out can be any Float32Array length >= count', () => {
    const out = new Float32Array(10);
    const result = createEasingSamples(easeLinear, 5, out);
    // Only the first 5 entries are written; the rest are still 0.
    expect(result[4]).toBeCloseTo(1);
    expect(result[5]).toBe(0);
  });
  it('floor(count) is used for fractional counts', () => {
    const result = createEasingSamples(easeLinear, 5.9);
    expect(result.length).toBe(5);
  });
});
