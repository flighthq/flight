import { createDisplayObject } from '@flighthq/displayobject';
import { createRectangle } from '@flighthq/geometry';
import type { RenderProxy2D, RenderViewport2D } from '@flighthq/types';

import { registerRenderer } from './renderer';
import { createRenderProxy2D, prepareDisplayObjectRender } from './renderProxy';
import { createRenderState } from './renderState';
import {
  computeRenderProxyWorldBounds,
  createRenderViewport2D,
  isRenderableInViewport,
  isRenderProxyInViewport,
} from './renderViewport';

// A proxy stand-in whose source carries no HasTransform2D — represents a source without spatial
// traits. Allocated through the real createRenderProxy2D so it is a proper entity (it carries the
// runtime key and binding identity), then its source is swapped for a trait-less fake.
function makeMinimalProxy(): RenderProxy2D {
  const state = createRenderState();
  const proxy = createRenderProxy2D(state, createDisplayObject());
  proxy.kind = 'Fake';
  proxy.source = { kind: 'Fake' } as unknown as RenderProxy2D['source'];
  return proxy;
}

describe('computeRenderProxyWorldBounds', () => {
  it('returns false for a source without HasTransform2D', () => {
    const proxy = makeMinimalProxy();
    const out = createRectangle();
    const result = computeRenderProxyWorldBounds(out, proxy.source);
    expect(result).toBe(false);
  });

  it('returns true and writes bounds for a DisplayObject', () => {
    const obj = createDisplayObject();
    const out = createRectangle();
    const result = computeRenderProxyWorldBounds(out, obj);
    // DisplayObject carries HasTransform2D; bounds are zero-sized at rest but the call succeeds.
    expect(result).toBe(true);
  });

  it('does not modify out when source has no transform trait', () => {
    const source = { kind: 'NoTransform' } as any;
    const out = { x: 10, y: 20, width: 30, height: 40 };
    computeRenderProxyWorldBounds(out, source);
    expect(out.x).toBe(10);
    expect(out.y).toBe(20);
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
  it('returns true for a source without HasTransform2D (conservative)', () => {
    const source = { kind: 'Fake' } as any;
    const vp: RenderViewport2D = { x: 0, y: 0, width: 100, height: 100 };
    expect(isRenderableInViewport(source, vp)).toBe(true);
  });

  it('returns true for a display object at origin within a large viewport', () => {
    const obj = createDisplayObject();
    // A zero-size object at 0,0 touches the viewport edge; treated as in-viewport (conservative).
    const vp: RenderViewport2D = { x: 0, y: 0, width: 800, height: 600 };
    expect(isRenderableInViewport(obj, vp)).toBe(true);
  });

  it('returns false for a display object whose bounds are outside the viewport', () => {
    const obj = createDisplayObject();
    // Place the viewport far away from the origin where obj's bounds are (0,0,0,0).
    const vp: RenderViewport2D = { x: 2000, y: 2000, width: 100, height: 100 };
    // The object's world bounds are at 0,0 — well outside the viewport starting at 2000,2000.
    // With exclusive right/bottom edges the 0-size rect at 0,0 should not overlap [2000..2100].
    expect(isRenderableInViewport(obj, vp)).toBe(false);
  });
});

describe('isRenderProxyInViewport', () => {
  it('returns true when the proxy source has no transform trait', () => {
    const proxy = makeMinimalProxy();
    const vp: RenderViewport2D = { x: 0, y: 0, width: 100, height: 100 };
    expect(isRenderProxyInViewport(proxy, vp)).toBe(true);
  });

  it('returns true for a proxy backed by a DisplayObject at origin in a large viewport', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    registerRenderer(state, obj.kind, { createData: () => null, submit: vi.fn() });
    prepareDisplayObjectRender(state, obj);
    // Build a proxy manually that references the display object.
    const proxy = makeMinimalProxy();
    proxy.source = obj as any;
    const vp: RenderViewport2D = { x: 0, y: 0, width: 800, height: 600 };
    expect(isRenderProxyInViewport(proxy, vp)).toBe(true);
  });
});
