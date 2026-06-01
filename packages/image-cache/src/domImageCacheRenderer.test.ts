import { createMatrix } from '@flighthq/geometry';
import {
  getOrCreateDisplayObjectRenderNode,
  registerRenderer,
  updateDisplayObjectBeforeRender,
} from '@flighthq/render-core';
import { createDOMRenderState, renderDOMDisplayObject } from '@flighthq/render-dom';
import { createDisplayObject } from '@flighthq/scenegraph-display';
import { DisplayObjectKind } from '@flighthq/types';

import { enableDOMImageCache } from './domImageCacheRenderer';
import { setImageCache } from './imageCache';

function makeState() {
  const container = document.createElement('div');
  return createDOMRenderState(container);
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

describe('enableDOMImageCache', () => {
  it('does not throw when called', () => {
    const state = makeState();
    expect(() => enableDOMImageCache(state)).not.toThrow();
  });

  it('does not throw when rendering a display object with an active cache', () => {
    const state = makeState();
    enableDOMImageCache(state);

    const obj = createDisplayObject();
    setImageCache(obj, makeImageCache());

    updateDisplayObjectBeforeRender(state, obj);
    expect(() => renderDOMDisplayObject(state, obj)).not.toThrow();
  });

  it('skips the original renderer when cache is active', () => {
    const state = makeState();
    enableDOMImageCache(state);
    const renderer = { createData: vi.fn(), draw: vi.fn(), drawMask: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);

    const obj = createDisplayObject();
    setImageCache(obj, makeImageCache());

    updateDisplayObjectBeforeRender(state, obj);
    renderDOMDisplayObject(state, obj);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('restores normal rendering when cache is cleared', () => {
    const state = makeState();
    enableDOMImageCache(state);
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
    renderDOMDisplayObject(state, obj);

    expect(renderer.draw).toHaveBeenCalledOnce();
  });
});
