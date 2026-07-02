import { createBitmap, createDisplayObject } from '@flighthq/displayobject';
import { createMatrix, createRectangle } from '@flighthq/geometry';
import { addNodeChild, getNodeRuntime, invalidateNodeLocalBounds, invalidateNodeLocalTransform } from '@flighthq/node';
import type { HasBoundsRectangleRuntime, RenderProxy2D, RenderViewport2D } from '@flighthq/types';

import { createRenderProxy2D, prepareDisplayObjectRender } from './renderProxy';
import { createRenderState } from './renderState';
import {
  computeRenderProxyWorldBounds,
  createRenderViewport2D,
  isRenderableInViewport,
  isRenderProxyInViewport,
} from './renderViewport';

function makeMinimalProxy(): RenderProxy2D {
  const state = createRenderState();
  const proxy = createRenderProxy2D(state, createDisplayObject());
  proxy.kind = 'Fake';
  proxy.source = { kind: 'Fake' } as unknown as RenderProxy2D['source'];
  return proxy;
}

function makeObjectWithBounds(x: number, y: number, width: number, height: number) {
  const obj = createDisplayObject();
  obj.x = x;
  obj.y = y;
  invalidateNodeLocalTransform(obj);
  const runtime = getNodeRuntime(obj) as unknown as HasBoundsRectangleRuntime;
  runtime.computeLocalBoundsRectangle = (out) => {
    out.x = 0;
    out.y = 0;
    out.width = width;
    out.height = height;
  };
  invalidateNodeLocalBounds(obj);
  return obj;
}

describe('computeRenderProxyWorldBounds', () => {
  it('returns false for a source without spatial traits', () => {
    const proxy = makeMinimalProxy();
    const out = createRectangle();
    const result = computeRenderProxyWorldBounds(out, proxy.source);
    expect(result).toBe(false);
  });

  it('returns true and writes world bounds for a DisplayObject', () => {
    const obj = makeObjectWithBounds(10, 20, 50, 30);
    const out = createRectangle();
    const result = computeRenderProxyWorldBounds(out, obj);
    expect(result).toBe(true);
    expect(out.x).toBe(10);
    expect(out.y).toBe(20);
    expect(out.width).toBe(50);
    expect(out.height).toBe(30);
  });

  it('does not modify out when source has no spatial traits', () => {
    const source = { kind: 'NoTransform' } as any;
    const out = { x: 10, y: 20, width: 30, height: 40 };
    computeRenderProxyWorldBounds(out, source);
    expect(out.x).toBe(10);
    expect(out.y).toBe(20);
  });

  it('accounts for ancestor transforms in world bounds', () => {
    const parent = createDisplayObject();
    parent.x = 100;
    invalidateNodeLocalTransform(parent);
    const child = makeObjectWithBounds(0, 0, 50, 50);
    addNodeChild(parent, child);

    const out = createRectangle();
    computeRenderProxyWorldBounds(out, child);
    expect(out.x).toBe(100);
    expect(out.width).toBe(50);
  });
});

describe('createRenderViewport2D', () => {
  it('creates a viewport with the given dimensions', () => {
    const vp = createRenderViewport2D(10, 20, 800, 600);
    expect(vp.x).toBe(10);
    expect(vp.y).toBe(20);
    expect(vp.width).toBe(800);
    expect(vp.height).toBe(600);
  });
});

describe('isRenderableInViewport', () => {
  it('returns true for a source without spatial traits (conservative)', () => {
    const source = { kind: 'Fake' } as any;
    const vp: RenderViewport2D = { x: 0, y: 0, width: 100, height: 100 };
    expect(isRenderableInViewport(source, vp)).toBe(true);
  });

  it('returns true for a display object within the viewport', () => {
    const obj = makeObjectWithBounds(10, 10, 50, 30);
    const vp: RenderViewport2D = { x: 0, y: 0, width: 800, height: 600 };
    expect(isRenderableInViewport(obj, vp)).toBe(true);
  });

  it('returns false for a display object whose world bounds are outside the viewport', () => {
    const obj = makeObjectWithBounds(100, 100, 50, 50);
    const vp: RenderViewport2D = { x: 2000, y: 2000, width: 100, height: 100 };
    expect(isRenderableInViewport(obj, vp)).toBe(false);
  });

  it('uses world bounds for a nested display object', () => {
    const parent = createDisplayObject();
    parent.x = 500;
    parent.y = 500;
    invalidateNodeLocalTransform(parent);
    const child = makeObjectWithBounds(0, 0, 20, 20);
    addNodeChild(parent, child);

    const vp: RenderViewport2D = { x: 0, y: 0, width: 100, height: 100 };
    expect(isRenderableInViewport(child, vp)).toBe(false);

    const largeVp: RenderViewport2D = { x: 0, y: 0, width: 600, height: 600 };
    expect(isRenderableInViewport(child, largeVp)).toBe(true);
  });

  it('culls an object at origin when the viewport is far away', () => {
    const obj = makeObjectWithBounds(0, 0, 30, 30);
    const vp: RenderViewport2D = { x: 5000, y: 5000, width: 100, height: 100 };
    expect(isRenderableInViewport(obj, vp)).toBe(false);
  });

  it('includes an object exactly at the viewport edge (inclusive)', () => {
    const obj = makeObjectWithBounds(0, 0, 100, 100);
    const vp: RenderViewport2D = { x: 100, y: 100, width: 100, height: 100 };
    expect(isRenderableInViewport(obj, vp)).toBe(true);
  });

  it('applies render transform when provided', () => {
    const obj = makeObjectWithBounds(0, 0, 50, 50);
    const vp: RenderViewport2D = { x: 0, y: 0, width: 60, height: 60 };

    expect(isRenderableInViewport(obj, vp)).toBe(true);

    const scale2x = createMatrix(2, 0, 0, 2, 0, 0);
    expect(isRenderableInViewport(obj, vp, scale2x)).toBe(true);

    const farVp: RenderViewport2D = { x: 0, y: 0, width: 60, height: 60 };
    const offsetTransform = createMatrix(1, 0, 0, 1, 200, 200);
    expect(isRenderableInViewport(obj, farVp, offsetTransform)).toBe(false);
  });

  it('works correctly with null render transform', () => {
    const obj = makeObjectWithBounds(10, 10, 50, 50);
    const vp: RenderViewport2D = { x: 0, y: 0, width: 800, height: 600 };
    expect(isRenderableInViewport(obj, vp, null)).toBe(true);
  });

  it('accounts for scaled parent transform in world bounds', () => {
    const parent = createDisplayObject();
    parent.scaleX = 2;
    parent.scaleY = 2;
    invalidateNodeLocalTransform(parent);
    const child = makeObjectWithBounds(0, 0, 50, 50);
    addNodeChild(parent, child);

    const vp: RenderViewport2D = { x: 80, y: 80, width: 50, height: 50 };
    expect(isRenderableInViewport(child, vp)).toBe(true);

    const smallVp: RenderViewport2D = { x: 200, y: 200, width: 50, height: 50 };
    expect(isRenderableInViewport(child, smallVp)).toBe(false);
  });
});

describe('isRenderProxyInViewport', () => {
  it('returns true when the proxy source has no spatial traits', () => {
    const proxy = makeMinimalProxy();
    const vp: RenderViewport2D = { x: 0, y: 0, width: 100, height: 100 };
    expect(isRenderProxyInViewport(proxy, vp)).toBe(true);
  });

  it('returns true for a proxy backed by a DisplayObject within the viewport', () => {
    const state = createRenderState();
    const obj = makeObjectWithBounds(10, 10, 50, 50);
    prepareDisplayObjectRender(state, obj);
    const proxy = createRenderProxy2D(state, obj);
    const vp: RenderViewport2D = { x: 0, y: 0, width: 800, height: 600 };
    expect(isRenderProxyInViewport(proxy, vp)).toBe(true);
  });
});
