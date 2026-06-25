import type { BitmapFilter } from '@flighthq/types';

import { getFilterSurfaceBounds } from './surfaceFilterBounds';

const src = { x: 0, y: 0, width: 100, height: 100 };

describe('getFilterSurfaceBounds', () => {
  it('BlurFilter expands bounds by blur radius', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const f = { kind: 'BlurFilter', blurX: 4, blurY: 4 } as unknown as BitmapFilter;
    getFilterSurfaceBounds(f, src, out);
    expect(out.x).toBeLessThan(src.x);
    expect(out.y).toBeLessThan(src.y);
    expect(out.width).toBeGreaterThan(src.width);
    expect(out.height).toBeGreaterThan(src.height);
  });
  it('DropShadowFilter expands bounds to include offset shadow', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const f = {
      kind: 'DropShadowFilter',
      angle: 0,
      distance: 10,
      blurX: 0,
      blurY: 0,
    } as unknown as BitmapFilter;
    getFilterSurfaceBounds(f, src, out);
    // Shadow goes to the right (dx=10), so width grows
    expect(out.width).toBeGreaterThan(src.width);
  });
  it('DropShadowFilter with negative direction expands in opposite direction', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const f = {
      kind: 'DropShadowFilter',
      angle: 180,
      distance: 10,
      blurX: 0,
      blurY: 0,
    } as unknown as BitmapFilter;
    getFilterSurfaceBounds(f, src, out);
    // Shadow goes left (dx≈-10), so x decreases
    expect(out.x).toBeLessThan(src.x);
  });
  it('OuterGlowFilter expands bounds', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const f = { kind: 'OuterGlowFilter', blurX: 6, blurY: 6 } as unknown as BitmapFilter;
    getFilterSurfaceBounds(f, src, out);
    expect(out.width).toBeGreaterThan(src.width);
  });
  it('InnerGlowFilter preserves source bounds', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const f = { kind: 'InnerGlowFilter', blurX: 4, blurY: 4 } as unknown as BitmapFilter;
    getFilterSurfaceBounds(f, src, out);
    expect(out.x).toBe(src.x);
    expect(out.y).toBe(src.y);
    expect(out.width).toBe(src.width);
    expect(out.height).toBe(src.height);
  });
  it('InnerShadowFilter preserves source bounds', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const f = { kind: 'InnerShadowFilter', blurX: 4, blurY: 4 } as unknown as BitmapFilter;
    getFilterSurfaceBounds(f, src, out);
    expect(out.width).toBe(src.width);
    expect(out.height).toBe(src.height);
  });
  it('ColorMatrixFilter preserves source bounds', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const f = {
      kind: 'ColorMatrixFilter',
      matrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    } as unknown as BitmapFilter;
    getFilterSurfaceBounds(f, src, out);
    expect(out.x).toBe(src.x);
    expect(out.width).toBe(src.width);
  });
  it('MedianFilter expands by radius', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const f = { kind: 'MedianFilter', radius: 3 } as unknown as BitmapFilter;
    getFilterSurfaceBounds(f, src, out);
    expect(out.x).toBe(-3);
    expect(out.y).toBe(-3);
    expect(out.width).toBe(106);
    expect(out.height).toBe(106);
  });
  it('ConvolutionFilter expands by kernel half-size', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const f = {
      kind: 'ConvolutionFilter',
      matrix: [0, 0, 0, 0, 1, 0, 0, 0, 0],
      matrixX: 3,
      matrixY: 3,
    } as unknown as BitmapFilter;
    getFilterSurfaceBounds(f, src, out);
    expect(out.x).toBe(-1);
    expect(out.y).toBe(-1);
    expect(out.width).toBe(102);
  });
  it('BevelFilter expands bounds', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const f = { kind: 'BevelFilter', blurX: 4, blurY: 4 } as unknown as BitmapFilter;
    getFilterSurfaceBounds(f, src, out);
    expect(out.width).toBeGreaterThan(src.width);
  });
  it('alias-safe: same object as sourceBounds and out', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 };
    const f = { kind: 'BlurFilter', blurX: 4, blurY: 4 } as unknown as BitmapFilter;
    getFilterSurfaceBounds(f, bounds, bounds);
    expect(bounds.width).toBeGreaterThan(100);
  });
  it('returns out for chaining', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const f = { kind: 'BlurFilter', blurX: 0, blurY: 0 } as unknown as BitmapFilter;
    const result = getFilterSurfaceBounds(f, src, out);
    expect(result).toBe(out);
  });
});
