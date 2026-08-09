import { CIRCLE_KAPPA, DEG_TO_RAD, EPSILON, HALF_PI, RAD_TO_DEG, TAU } from './constants';

describe('constants', () => {
  describe('CIRCLE_KAPPA', () => {
    // Asserted against the COMPUTED expression, never a transcribed decimal. A test that restates the
    // digits agrees with a typo in them, which is how a wrong digit at the 13th decimal survived a
    // full suite. Exact equality, not toBeCloseTo: the error this guards against is far smaller than
    // any tolerance worth writing.
    it('equals four thirds of the square root of two less one', () => {
      expect(CIRCLE_KAPPA).toBe((4 * (Math.sqrt(2) - 1)) / 3);
    });

    it('sweeps a unit quarter circle when used as the cubic control distance', () => {
      // Catches a wrong FORMULA, not a wrong digit — and only that. A mistyped decimal moves the
      // swept radius far less than the cubic's own approximation error, so this cannot stand in for
      // the exact equality above. What it does add is independence from it: if the constant and that
      // assertion were ever edited to agree on a wrong expression, the geometry would still object.
      const radiusAt = (t: number): number => {
        const u = 1 - t;
        const x = u * u * u + 3 * u * u * t + 3 * u * t * t * CIRCLE_KAPPA;
        const y = 3 * u * u * t * CIRCLE_KAPPA + 3 * u * t * t + t * t * t;
        return Math.hypot(x, y);
      };

      for (const t of [0, 0.25, 0.5, 0.75, 1]) expect(radiusAt(t)).toBeCloseTo(1, 3);
    });
  });

  describe('DEG_TO_RAD', () => {
    it('converts 180 degrees to π', () => {
      expect(180 * DEG_TO_RAD).toBeCloseTo(Math.PI, 10);
    });
    it('converts 360 degrees to 2π', () => {
      expect(360 * DEG_TO_RAD).toBeCloseTo(Math.PI * 2, 10);
    });
  });
  describe('EPSILON', () => {
    it('is a positive number', () => {
      expect(EPSILON).toBeGreaterThan(0);
    });
    it('is smaller than 1e-5', () => {
      expect(EPSILON).toBeLessThan(1e-5);
    });
  });
  describe('HALF_PI', () => {
    it('equals π / 2', () => {
      expect(HALF_PI).toBeCloseTo(Math.PI / 2, 10);
    });
  });
  describe('RAD_TO_DEG', () => {
    it('converts π radians to 180 degrees', () => {
      expect(Math.PI * RAD_TO_DEG).toBeCloseTo(180, 10);
    });
    it('is the reciprocal of DEG_TO_RAD', () => {
      expect(RAD_TO_DEG * DEG_TO_RAD).toBeCloseTo(1, 10);
    });
  });
  describe('TAU', () => {
    it('equals 2π', () => {
      expect(TAU).toBeCloseTo(Math.PI * 2, 10);
    });
  });
});
