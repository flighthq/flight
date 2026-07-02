import { clamp, inRange, saturate } from './clamp';

describe('clamp', () => {
  it('clamps below minimum', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });
  it('clamps above maximum', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
  it('leaves value within range unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('leaves value equal to min unchanged', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });
  it('leaves value equal to max unchanged', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });
  it('propagates NaN', () => {
    expect(clamp(NaN, 0, 10)).toBeNaN();
  });
});

describe('inRange', () => {
  it('returns true for a value within range', () => {
    expect(inRange(5, 0, 10)).toBe(true);
  });
  it('returns true at the minimum boundary', () => {
    expect(inRange(0, 0, 10)).toBe(true);
  });
  it('returns true at the maximum boundary', () => {
    expect(inRange(10, 0, 10)).toBe(true);
  });
  it('returns false below minimum', () => {
    expect(inRange(-1, 0, 10)).toBe(false);
  });
  it('returns false above maximum', () => {
    expect(inRange(11, 0, 10)).toBe(false);
  });
});

describe('saturate', () => {
  it('clamps below 0 to 0', () => {
    expect(saturate(-1)).toBe(0);
  });
  it('clamps above 1 to 1', () => {
    expect(saturate(2)).toBe(1);
  });
  it('leaves value within [0, 1] unchanged', () => {
    expect(saturate(0.5)).toBe(0.5);
  });
  it('leaves 0 unchanged', () => {
    expect(saturate(0)).toBe(0);
  });
  it('leaves 1 unchanged', () => {
    expect(saturate(1)).toBe(1);
  });
  it('returns 0 for NaN (GPU semantics)', () => {
    expect(saturate(NaN)).toBe(0);
  });
});
