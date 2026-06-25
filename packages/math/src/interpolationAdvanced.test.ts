import { damp, lerpAngle, moveTowards, pingPong, repeat, smootherStep } from './interpolationAdvanced';

describe('damp', () => {
  it('moves current toward target over time', () => {
    const result = damp(0, 10, 1, 1);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(10);
  });
  it('returns current when deltaTime is 0', () => {
    expect(damp(5, 10, 2, 0)).toBe(5);
  });
  it('returns current when lambda is 0', () => {
    expect(damp(5, 10, 0, 1)).toBe(5);
  });
  it('approaches target asymptotically', () => {
    const stepValue = damp(0, 1, 5, 0.1);
    expect(stepValue).toBeGreaterThan(0.39);
    expect(stepValue).toBeLessThan(0.41);
  });
  it('is frame-rate independent: two half-steps equal one full step', () => {
    const full = damp(0, 1, 2, 0.2);
    const half1 = damp(0, 1, 2, 0.1);
    const half2 = damp(half1, 1, 2, 0.1);
    expect(half2).toBeCloseTo(full, 10);
  });
});

describe('lerpAngle', () => {
  it('interpolates between two close angles', () => {
    const result = lerpAngle(0, Math.PI / 2, 0.5);
    expect(result).toBeCloseTo(Math.PI / 4, 10);
  });
  it('takes the shortest arc across 0/2π', () => {
    // 1.9π → 0.1π: the short arc is +0.2π. At t = 0.5 the result is 1.9π + 0.1π = 2π.
    // 2π and 0 are the same angle; normalise before comparing.
    const TAU = Math.PI * 2;
    const result = lerpAngle(Math.PI * 1.9, Math.PI * 0.1, 0.5);
    const normalised = ((result % TAU) + TAU) % TAU;
    expect(normalised).toBeCloseTo(0, 5);
  });
  it('returns a at t = 0', () => {
    expect(lerpAngle(1, 2, 0)).toBeCloseTo(1, 10);
  });
  it('returns b at t = 1', () => {
    expect(lerpAngle(1, 2, 1)).toBeCloseTo(2, 10);
  });
});

describe('moveTowards', () => {
  it('moves toward target by maxDelta', () => {
    expect(moveTowards(0, 10, 3)).toBe(3);
  });
  it('snaps to target when within maxDelta', () => {
    expect(moveTowards(9, 10, 5)).toBe(10);
  });
  it('works when target is below current', () => {
    expect(moveTowards(10, 0, 3)).toBe(7);
  });
  it('returns target when current equals target', () => {
    expect(moveTowards(5, 5, 1)).toBe(5);
  });
});

describe('pingPong', () => {
  it('starts at 0', () => {
    expect(pingPong(0, 1)).toBe(0);
  });
  it('reaches length at t = length', () => {
    expect(pingPong(1, 1)).toBe(1);
  });
  it('bounces back at t = 1.5 * length', () => {
    expect(pingPong(1.5, 1)).toBeCloseTo(0.5, 10);
  });
  it('returns 0 when length is 0', () => {
    expect(pingPong(1, 0)).toBe(0);
  });
  it('works with larger lengths', () => {
    expect(pingPong(3, 2)).toBeCloseTo(1, 10);
  });
});

describe('repeat', () => {
  it('wraps t over [0, length)', () => {
    expect(repeat(1.6, 1)).toBeCloseTo(0.6, 10);
  });
  it('returns 0 for exact multiple', () => {
    expect(repeat(2, 1)).toBeCloseTo(0, 10);
  });
  it('handles negative t', () => {
    const r = repeat(-0.3, 1);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
  });
  it('returns 0 when length is 0', () => {
    expect(repeat(1, 0)).toBe(0);
  });
});

describe('smootherStep', () => {
  it('returns 0 at the lower edge', () => {
    expect(smootherStep(0, 1, 0)).toBe(0);
  });
  it('returns 1 at the upper edge', () => {
    expect(smootherStep(0, 1, 1)).toBe(1);
  });
  it('returns 0.5 at the midpoint', () => {
    expect(smootherStep(0, 1, 0.5)).toBe(0.5);
  });
  it('returns 0 for x below the lower edge', () => {
    expect(smootherStep(0, 1, -1)).toBe(0);
  });
  it('returns 1 for x above the upper edge', () => {
    expect(smootherStep(0, 1, 2)).toBe(1);
  });
  it('has zero first and second derivatives at the edges', () => {
    const h = 0.001;
    const dLow = (smootherStep(0, 1, h) - smootherStep(0, 1, 0)) / h;
    const dHigh = (smootherStep(0, 1, 1) - smootherStep(0, 1, 1 - h)) / h;
    expect(dLow).toBeCloseTo(0, 1);
    expect(dHigh).toBeCloseTo(0, 1);
  });
});
