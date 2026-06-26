import { computeDropShadowFilterCss } from './cssDropShadowFilter';

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
