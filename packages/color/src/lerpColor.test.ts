import { lerpColor, lerpLinearColor } from './lerpColor';
import { allocateLinearColor } from './packColor';

describe('lerpColor', () => {
  it('returns start at t=0', () => {
    expect(lerpColor(0xff0000ff, 0x0000ffff, 0)).toBe(0xff0000ff);
  });
  it('returns end at t=1', () => {
    expect(lerpColor(0xff0000ff, 0x0000ffff, 1)).toBe(0x0000ffff);
  });
  it('clamps t below 0 to 0', () => {
    expect(lerpColor(0xff0000ff, 0x0000ffff, -1)).toBe(0xff0000ff);
  });
  it('clamps t above 1 to 1', () => {
    expect(lerpColor(0xff0000ff, 0x0000ffff, 2)).toBe(0x0000ffff);
  });
  it('midpoint between black and white is approximately mid-gray', () => {
    const mid = lerpColor(0x000000ff, 0xffffffff, 0.5);
    const r = (mid >>> 24) & 0xff;
    expect(r).toBeCloseTo(0xbc, -1);
  });
});

describe('lerpLinearColor', () => {
  it('returns start at t=0', () => {
    const out = allocateLinearColor();
    const start: [number, number, number, number] = [1, 0, 0, 1];
    const end: [number, number, number, number] = [0, 0, 1, 1];
    lerpLinearColor(out, start, end, 0);
    expect(out).toEqual(start);
  });
  it('returns end at t=1', () => {
    const out = allocateLinearColor();
    const start: [number, number, number, number] = [1, 0, 0, 1];
    const end: [number, number, number, number] = [0, 0, 1, 1];
    lerpLinearColor(out, start, end, 1);
    expect(out).toEqual(end);
  });
  it('is alias-safe when out is the same object as start', () => {
    const start: [number, number, number, number] = [1, 0, 0, 1];
    const end: [number, number, number, number] = [0, 0, 1, 1];
    const out = start;
    lerpLinearColor(out, out, end, 0.5);
    expect(out[0]).toBeCloseTo(0.5, 8);
    expect(out[2]).toBeCloseTo(0.5, 8);
  });
  it('returns the out instance', () => {
    const out = allocateLinearColor();
    const start: [number, number, number, number] = [0, 0, 0, 0];
    const end: [number, number, number, number] = [1, 1, 1, 1];
    expect(lerpLinearColor(out, start, end, 0.5)).toBe(out);
  });
});
