import { createMatrix } from '@flighthq/geometry';
import { createCanvasRenderState, renderCanvasDisplayObject } from '@flighthq/render-canvas';
import { registerRenderer } from '@flighthq/render-core';
import { getOrCreateDisplayObjectRenderNode, updateDisplayObjectBeforeRender } from '@flighthq/render-tree';
import { addSceneChild } from '@flighthq/scene-core';
import { createDisplayObject } from '@flighthq/scene-display';
import { DisplayObjectKind } from '@flighthq/types';

import { enableCanvasImageCache } from './canvasImageCacheRenderer';
import { setImageCache } from './imageCache';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const state = createCanvasRenderState(canvas);
  enableCanvasImageCache(state);
  return state;
}

describe('enableCanvasImageCache', () => {
  it('draws from imageCache when active', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const offscreen = document.createElement('canvas');
    offscreen.width = 50;
    offscreen.height = 50;
    setImageCache(obj, {
      source: { src: offscreen, width: 50, height: 50, version: 0 } as any,
      transform: createMatrix(),
    });

    updateDisplayObjectBeforeRender(state, obj);
    const drawImageSpy = vi.spyOn(state.context, 'drawImage');
    renderCanvasDisplayObject(state, obj);

    expect(drawImageSpy).toHaveBeenCalledOnce();
  });

  it('skips the original renderer when cache is active', () => {
    const state = makeState();
    const renderer = { createData: vi.fn(), draw: vi.fn(), drawMask: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);

    const obj = createDisplayObject();
    const offscreen = document.createElement('canvas');
    offscreen.width = 50;
    offscreen.height = 50;
    setImageCache(obj, {
      source: { src: offscreen, width: 50, height: 50, version: 0 } as any,
      transform: createMatrix(),
    });

    updateDisplayObjectBeforeRender(state, obj);
    renderCanvasDisplayObject(state, obj);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('suppresses children when cache is active', () => {
    const state = makeState();
    const childRenderer = { createData: vi.fn(), draw: vi.fn(), drawMask: vi.fn() };
    registerRenderer(state, DisplayObjectKind, childRenderer);

    const parent = createDisplayObject();
    const child = createDisplayObject();
    addSceneChild(parent, child);

    const offscreen = document.createElement('canvas');
    offscreen.width = 50;
    offscreen.height = 50;
    setImageCache(parent, {
      source: { src: offscreen, width: 50, height: 50, version: 0 } as any,
      transform: createMatrix(),
    });

    updateDisplayObjectBeforeRender(state, parent);
    renderCanvasDisplayObject(state, parent);

    expect(childRenderer.draw).not.toHaveBeenCalled();
  });

  it('restores normal rendering when cache is cleared', () => {
    const state = makeState();
    const renderer = { createData: vi.fn(), draw: vi.fn(), drawMask: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);

    const obj = createDisplayObject();
    const offscreen = document.createElement('canvas');
    offscreen.width = 50;
    offscreen.height = 50;
    setImageCache(obj, {
      source: { src: offscreen, width: 50, height: 50, version: 0 } as any,
      transform: createMatrix(),
    });
    updateDisplayObjectBeforeRender(state, obj);

    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    data.visible = true;
    data.alpha = 1;
    data.transform2D.a = 1;
    data.transform2D.d = 1;

    // Clear the cache
    setImageCache(obj, { source: null, transform: createMatrix() } as any);
    updateDisplayObjectBeforeRender(state, obj);
    renderCanvasDisplayObject(state, obj);

    expect(renderer.draw).toHaveBeenCalledOnce();
  });
});
