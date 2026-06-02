import { createMatrix } from '@flighthq/geometry';
import { registerRenderer } from '@flighthq/render-core';
import { getOrCreateDisplayObjectRenderNode, updateDisplayObjectBeforeRender } from '@flighthq/render-tree';
import { createWebGLRenderState, renderWebGLDisplayObject } from '@flighthq/render-webgl';
import { createDisplayObject } from '@flighthq/scene-display';
import { DisplayObjectKind } from '@flighthq/types';

import { setImageCache } from './imageCache';
import { enableWebGLImageCache } from './webglImageCacheRenderer';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createWebGLRenderState(canvas);
}

function makeImageCache() {
  const offscreen = document.createElement('canvas');
  offscreen.width = 50;
  offscreen.height = 50;
  return {
    source: { src: offscreen, width: 50, height: 50, version: 0 } as any,
    transform: createMatrix(),
  };
}

describe('enableWebGLImageCache', () => {
  it('does not throw when called', () => {
    const state = makeState();
    expect(() => enableWebGLImageCache(state)).not.toThrow();
  });

  it('does not throw when rendering a display object with an active cache', () => {
    const state = makeState();
    enableWebGLImageCache(state);

    const obj = createDisplayObject();
    setImageCache(obj, makeImageCache());

    updateDisplayObjectBeforeRender(state, obj);
    expect(() => renderWebGLDisplayObject(state, obj)).not.toThrow();
  });

  it('skips the original renderer when cache is active', () => {
    const state = makeState();
    enableWebGLImageCache(state);
    const renderer = { createData: vi.fn(), draw: vi.fn(), drawMask: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);

    const obj = createDisplayObject();
    setImageCache(obj, makeImageCache());

    updateDisplayObjectBeforeRender(state, obj);
    renderWebGLDisplayObject(state, obj);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('restores normal rendering when cache is cleared', () => {
    const state = makeState();
    enableWebGLImageCache(state);
    const renderer = { createData: vi.fn(), draw: vi.fn(), drawMask: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);

    const obj = createDisplayObject();
    setImageCache(obj, makeImageCache());
    updateDisplayObjectBeforeRender(state, obj);

    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    data.visible = true;
    data.alpha = 1;
    data.transform2D.a = 1;
    data.transform2D.d = 1;

    setImageCache(obj, { source: null, transform: createMatrix() } as any);
    updateDisplayObjectBeforeRender(state, obj);
    renderWebGLDisplayObject(state, obj);

    expect(renderer.draw).toHaveBeenCalledOnce();
  });
});
