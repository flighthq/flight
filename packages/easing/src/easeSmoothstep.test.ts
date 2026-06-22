import { easeSmootherstep, easeSmoothstep } from './easeSmoothstep';

describe('easeSmootherstep', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeSmootherstep(0)).toBe(0);
    expect(easeSmootherstep(1)).toBe(1);
  });

  it('is symmetric about the midpoint', () => {
    expect(easeSmootherstep(0.5)).toBeCloseTo(0.5);
  });

  it('is monotonically increasing', () => {
    let prev = easeSmootherstep(0);
    for (let i = 1; i <= 20; i++) {
      const value = easeSmootherstep(i / 20);
      expect(value).toBeGreaterThanOrEqual(prev);
      prev = value;
    }
  });

  it('approaches endpoints more gently than smoothstep', () => {
    // Higher-order flattening means a smaller value near the start.
    expect(easeSmootherstep(0.25)).toBeLessThan(easeSmoothstep(0.25));
  });
});

describe('easeSmoothstep', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeSmoothstep(0)).toBe(0);
    expect(easeSmoothstep(1)).toBe(1);
  });

  it('is symmetric about the midpoint', () => {
    expect(easeSmoothstep(0.5)).toBeCloseTo(0.5);
  });

  it('matches the known cubic value at t=0.25', () => {
    expect(easeSmoothstep(0.25)).toBeCloseTo(0.15625);
  });

  it('is monotonically increasing', () => {
    let prev = easeSmoothstep(0);
    for (let i = 1; i <= 20; i++) {
      const value = easeSmoothstep(i / 20);
      expect(value).toBeGreaterThanOrEqual(prev);
      prev = value;
    }
  });
});
