import { createMatrix, createRectangle, setRectangle } from '@flighthq/geometry';
import {
  computeRenderTargetSize,
  createDisplayObjectRenderTargetPlacement,
  updateDisplayObjectRenderTargetPlacement,
} from '@flighthq/render';
import { getLocalBoundsRectangle } from '@flighthq/scene';
import { createDisplayObject } from '@flighthq/scene-display';

describe('computeRenderTargetSize', () => {
  it('returns content dimensions with no padding', () => {
    const bounds = createRectangle();
    setRectangle(bounds, 0, 0, 64.5, 48.2);

    const { width, height } = computeRenderTargetSize(bounds);

    expect(width).toBe(65); // ceil(64.5)
    expect(height).toBe(49); // ceil(48.2)
  });

  it('adds symmetric padding', () => {
    const bounds = createRectangle();
    setRectangle(bounds, 0, 0, 100, 80);

    const { width, height } = computeRenderTargetSize(bounds, 16);

    expect(width).toBe(132); // 100 + 16*2
    expect(height).toBe(112); // 80 + 16*2
  });

  it('respects minimum dimensions', () => {
    const bounds = createRectangle(); // zero size

    const { width, height } = computeRenderTargetSize(bounds, 0, 256, 128);

    expect(width).toBe(256);
    expect(height).toBe(128);
  });

  it('uses content size when it exceeds minimum', () => {
    const bounds = createRectangle();
    setRectangle(bounds, 0, 0, 512, 400);

    const { width, height } = computeRenderTargetSize(bounds, 0, 256, 128);

    expect(width).toBe(512);
    expect(height).toBe(400);
  });
});

describe('createDisplayObjectRenderTargetPlacement', () => {
  it('produces identity-like renderTransform for identity source at origin', () => {
    const source = createDisplayObject();
    const bounds = createRectangle();

    const { renderTransform } = createDisplayObjectRenderTargetPlacement(source, bounds);

    // source LT = identity, bounds at origin → renderTransform = translation(0,0) * identity = identity
    expect(renderTransform.a).toBeCloseTo(1);
    expect(renderTransform.d).toBeCloseTo(1);
    expect(renderTransform.tx).toBeCloseTo(0);
    expect(renderTransform.ty).toBeCloseTo(0);
  });

  it('shifts renderTransform so bounds origin maps to (0,0) in the target', () => {
    const source = createDisplayObject();
    const bounds = createRectangle();
    setRectangle(bounds, 10, 20, 100, 50);

    const { renderTransform } = createDisplayObjectRenderTargetPlacement(source, bounds);

    expect(renderTransform.tx).toBeCloseTo(-10);
    expect(renderTransform.ty).toBeCloseTo(-20);
  });

  it('applies contentX/contentY so bounds origin maps to (contentX,contentY)', () => {
    const source = createDisplayObject();
    const bounds = createRectangle();
    setRectangle(bounds, 10, 20, 100, 50);

    const { renderTransform } = createDisplayObjectRenderTargetPlacement(source, bounds, {
      contentX: 16,
      contentY: 8,
    });

    expect(renderTransform.tx).toBeCloseTo(6); // contentX - bounds.x = 16 - 10
    expect(renderTransform.ty).toBeCloseTo(-12); // contentY - bounds.y = 8 - 20
  });

  it('produces cacheTransform that places image at bounds origin', () => {
    const source = createDisplayObject();
    const bounds = createRectangle();
    setRectangle(bounds, 5, 10, 64, 48);

    const { cacheTransform } = createDisplayObjectRenderTargetPlacement(source, bounds);

    expect(cacheTransform.tx).toBe(5);
    expect(cacheTransform.ty).toBe(10);
  });

  it('shifts cacheTransform by content offset', () => {
    const source = createDisplayObject();
    const bounds = createRectangle();
    setRectangle(bounds, 5, 10, 64, 48);

    const { cacheTransform } = createDisplayObjectRenderTargetPlacement(source, bounds, {
      contentX: 8,
      contentY: 4,
    });

    // bounds.x - contentX = 5 - 8 = -3
    expect(cacheTransform.tx).toBe(-3);
    expect(cacheTransform.ty).toBe(6);
  });

  it('renderTransform + cacheTransform round-trip: content vertex lands at original position', () => {
    // For an identity-transform source, source.transform2D = renderTransform * localTransform.
    // The render tree computes transform2D = renderTransform (since localTransform ≈ identity).
    // A vertex at local (bounds.x, bounds.y) should canvas-project to (contentX, contentY),
    // and the cache places (contentX, contentY) back at (bounds.x, bounds.y) world-space.
    const source = createDisplayObject();
    const bounds = createRectangle();
    setRectangle(bounds, 20, 30, 80, 60);
    const contentX = 12;
    const contentY = 16;

    const { renderTransform, cacheTransform } = createDisplayObjectRenderTargetPlacement(source, bounds, {
      contentX,
      contentY,
    });

    // renderTransform * (bounds.x, bounds.y) = (contentX, contentY)  (a,b,c,d≈identity)
    const cx = renderTransform.a * bounds.x + renderTransform.c * bounds.y + renderTransform.tx;
    const cy = renderTransform.b * bounds.x + renderTransform.d * bounds.y + renderTransform.ty;
    expect(cx).toBeCloseTo(contentX);
    expect(cy).toBeCloseTo(contentY);

    // cacheTransform places canvas (0,0) back at (bounds.x - contentX, bounds.y - contentY)
    expect(cacheTransform.tx).toBeCloseTo(bounds.x - contentX);
    expect(cacheTransform.ty).toBeCloseTo(bounds.y - contentY);
  });
});

describe('updateDisplayObjectRenderTargetPlacement', () => {
  it('writes the same values as createDisplayObjectRenderTargetPlacement', () => {
    const source = createDisplayObject();
    const bounds = createRectangle();
    setRectangle(bounds, 5, 10, 64, 48);

    const created = createDisplayObjectRenderTargetPlacement(source, bounds, { contentX: 4, contentY: 8 });

    const outRT = createMatrix();
    const outCT = createMatrix();
    updateDisplayObjectRenderTargetPlacement(source, bounds, outRT, outCT, { contentX: 4, contentY: 8 });

    expect(outRT.tx).toBeCloseTo(created.renderTransform.tx);
    expect(outRT.ty).toBeCloseTo(created.renderTransform.ty);
    expect(outCT.tx).toBe(created.cacheTransform.tx);
    expect(outCT.ty).toBe(created.cacheTransform.ty);
  });
});
