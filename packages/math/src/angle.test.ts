import { degToRad, deltaAngle, normalizeAngle, radToDeg } from './angle';

describe('degToRad', () => {
  it('converts 0 degrees to 0 radians', () => {
    expect(degToRad(0)).toBe(0);
  });
  it('converts 180 degrees to π', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI, 10);
  });
  it('converts 360 degrees to 2π', () => {
    expect(degToRad(360)).toBeCloseTo(Math.PI * 2, 10);
  });
  it('converts 90 degrees to π/2', () => {
    expect(degToRad(90)).toBeCloseTo(Math.PI / 2, 10);
  });
  it('converts negative degrees', () => {
    expect(degToRad(-90)).toBeCloseTo(-Math.PI / 2, 10);
  });
});

describe('deltaAngle', () => {
  it('returns 0 for identical angles', () => {
    expect(deltaAngle(1, 1)).toBeCloseTo(0, 10);
  });
  it('returns the shortest arc when crossing 0', () => {
    // from = π - 0.1, to = -(π - 0.1). The short arc going forward is 0.2 rad.
    expect(deltaAngle(Math.PI - 0.1, -(Math.PI - 0.1))).toBeCloseTo(0.2, 5);
  });
  it('returns a positive delta when the target is ahead', () => {
    expect(deltaAngle(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 10);
  });
  it('returns a negative delta when the target is behind', () => {
    expect(deltaAngle(Math.PI / 2, 0)).toBeCloseTo(-Math.PI / 2, 10);
  });
  it('result is always within (-π, π]', () => {
    for (let i = -10; i <= 10; i++) {
      const d = deltaAngle(i, i + 3);
      expect(d).toBeGreaterThan(-Math.PI);
      expect(d).toBeLessThanOrEqual(Math.PI);
    }
  });
});

describe('normalizeAngle', () => {
  it('normalizes 0 to 0', () => {
    expect(normalizeAngle(0)).toBeCloseTo(0, 10);
  });
  it('normalizes π to -π (range is [-π, π))', () => {
    // The range is [-π, π): π is outside the range, maps to -π.
    expect(normalizeAngle(Math.PI)).toBeCloseTo(-Math.PI, 5);
  });
  it('wraps 2π to 0', () => {
    expect(normalizeAngle(Math.PI * 2)).toBeCloseTo(0, 10);
  });
  it('wraps values above π to the negative side', () => {
    expect(normalizeAngle(Math.PI + 1)).toBeCloseTo(-(Math.PI - 1), 10);
  });
  it('wraps negative values into [-π, π)', () => {
    expect(normalizeAngle(-Math.PI * 3)).toBeCloseTo(-Math.PI, 5);
  });
  it('result is always in [-π, π)', () => {
    for (let i = -20; i <= 20; i++) {
      const a = normalizeAngle(i);
      expect(a).toBeGreaterThanOrEqual(-Math.PI);
      expect(a).toBeLessThan(Math.PI);
    }
  });
});

describe('radToDeg', () => {
  it('converts 0 radians to 0 degrees', () => {
    expect(radToDeg(0)).toBe(0);
  });
  it('converts π to 180 degrees', () => {
    expect(radToDeg(Math.PI)).toBeCloseTo(180, 10);
  });
  it('converts 2π to 360 degrees', () => {
    expect(radToDeg(Math.PI * 2)).toBeCloseTo(360, 10);
  });
  it('is the inverse of degToRad', () => {
    expect(radToDeg(degToRad(45))).toBeCloseTo(45, 10);
  });
});
