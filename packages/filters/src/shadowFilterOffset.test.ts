import { getShadowFilterOffset } from './shadowFilterOffset';

describe('getShadowFilterOffset', () => {
  it('angle 0 degrees gives offset along positive x axis', () => {
    const out = { dx: 0, dy: 0 };
    getShadowFilterOffset({ kind: 'DropShadowFilter', angle: 0, distance: 4 }, out);
    expect(out.dx).toBe(4);
    expect(out.dy).toBe(0);
  });

  it('angle 90 degrees gives offset along positive y axis', () => {
    const out = { dx: 0, dy: 0 };
    getShadowFilterOffset({ kind: 'DropShadowFilter', angle: 90, distance: 4 }, out);
    expect(out.dx).toBe(0);
    expect(out.dy).toBe(4);
  });

  it('uses defaults when angle and distance are omitted', () => {
    const out = { dx: 0, dy: 0 };
    getShadowFilterOffset({ kind: 'DropShadowFilter' }, out);
    const expected = Math.round(Math.cos(Math.PI / 4) * 4);
    expect(out.dx).toBe(expected);
    expect(out.dy).toBe(expected);
  });

  it('works for InnerShadowFilter', () => {
    const out = { dx: 0, dy: 0 };
    getShadowFilterOffset({ kind: 'InnerShadowFilter', angle: 0, distance: 8 }, out);
    expect(out.dx).toBe(8);
    expect(out.dy).toBe(0);
  });

  it('works for BevelFilter', () => {
    const out = { dx: 0, dy: 0 };
    getShadowFilterOffset({ kind: 'BevelFilter', angle: 180, distance: 4 }, out);
    expect(out.dx).toBe(-4);
    expect(out.dy).toBeCloseTo(0, 0);
  });

  it('returns out', () => {
    const out = { dx: 0, dy: 0 };
    const result = getShadowFilterOffset({ kind: 'DropShadowFilter', angle: 0, distance: 4 }, out);
    expect(result).toBe(out);
  });
});
