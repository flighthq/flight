import { DEG_TO_RAD, EPSILON, HALF_PI, RAD_TO_DEG, TAU } from './constants';

describe('constants', () => {
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
