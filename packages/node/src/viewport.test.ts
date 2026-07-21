import { createViewport, getViewportAspect } from './viewport';

describe('createViewport', () => {
  it('returns a zero rect at unit device-pixel ratio by default', () => {
    const viewport = createViewport();
    expect(viewport.x).toBe(0);
    expect(viewport.y).toBe(0);
    expect(viewport.width).toBe(0);
    expect(viewport.height).toBe(0);
    expect(viewport.devicePixelRatio).toBe(1);
  });

  it('accepts overrides', () => {
    const viewport = createViewport({ devicePixelRatio: 2, height: 600, width: 800, x: 10, y: 20 });
    expect(viewport.x).toBe(10);
    expect(viewport.y).toBe(20);
    expect(viewport.width).toBe(800);
    expect(viewport.height).toBe(600);
    expect(viewport.devicePixelRatio).toBe(2);
  });
});

describe('getViewportAspect', () => {
  it('returns width / height for a non-degenerate rect', () => {
    expect(getViewportAspect(createViewport({ height: 600, width: 800 }))).toBeCloseTo(800 / 600);
  });

  it('returns 1 for a zero-height rect', () => {
    expect(getViewportAspect(createViewport({ height: 0, width: 800 }))).toBe(1);
  });
});
