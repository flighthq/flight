import { computeDropShadowFilterCss, getShadowFilterOffset } from './cssDropShadowFilter';

describe('computeDropShadowFilterCss', () => {
  it('returns drop-shadow CSS for a basic shadow', () => {
    const result = computeDropShadowFilterCss({
      kind: 'DropShadowFilter',
      angle: 0,
      distance: 4,
      blurX: 2,
      blurY: 2,
      color: 0,
      alpha: 1,
    });
    expect(result).toBe('drop-shadow(4px 0px 2px rgba(0,0,0,1.000))');
  });

  it('returns null for anisotropic blur', () => {
    expect(computeDropShadowFilterCss({ kind: 'DropShadowFilter', blurX: 2, blurY: 8 })).toBeNull();
  });

  it('returns null when knockout is true', () => {
    expect(computeDropShadowFilterCss({ kind: 'DropShadowFilter', knockout: true })).toBeNull();
  });

  it('encodes color correctly', () => {
    const result = computeDropShadowFilterCss({
      kind: 'DropShadowFilter',
      angle: 0,
      distance: 0,
      color: 0xff8040,
      alpha: 0.5,
    });
    expect(result).toContain('rgba(255,128,64,0.500)');
  });
});

describe('getShadowFilterOffset', () => {
  it('computes offset for angle 0 (pointing right)', () => {
    const { dx, dy } = getShadowFilterOffset({ kind: 'DropShadowFilter', angle: 0, distance: 10 });
    expect(dx).toBe(10);
    expect(dy).toBe(0);
  });

  it('computes offset for angle 90 (pointing down)', () => {
    const { dx, dy } = getShadowFilterOffset({ kind: 'DropShadowFilter', angle: 90, distance: 10 });
    expect(dx).toBe(0);
    expect(dy).toBe(10);
  });

  it('uses default angle 45 and distance 4', () => {
    const { dx, dy } = getShadowFilterOffset({ kind: 'DropShadowFilter' });
    const expected = Math.round(Math.cos((45 * Math.PI) / 180) * 4);
    expect(dx).toBe(expected);
    expect(dy).toBe(expected);
  });

  it('works with BevelFilter', () => {
    const { dx, dy } = getShadowFilterOffset({ kind: 'BevelFilter', angle: 0, distance: 5 });
    expect(dx).toBe(5);
    expect(dy).toBe(0);
  });

  it('works with InnerShadowFilter', () => {
    const { dx, dy } = getShadowFilterOffset({ kind: 'InnerShadowFilter', angle: 0, distance: 3 });
    expect(dx).toBe(3);
    expect(dy).toBe(0);
  });
});
