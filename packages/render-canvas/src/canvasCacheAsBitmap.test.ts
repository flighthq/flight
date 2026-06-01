import { createMatrix } from '@flighthq/geometry';
import { setImageCache } from '@flighthq/image-cache';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';

import { drawImageCacheResult } from './canvasCacheAsBitmap';
import { createCanvasRenderState } from './canvasRenderState';

describe('drawImageCacheResult', () => {
  it('does not throw when canvas is null', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    const cache = { canvas: null, transform: createMatrix() };

    expect(() => drawImageCacheResult(state, data, cache)).not.toThrow();
  });

  it('calls drawImage when canvas is set', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const obj = createDisplayObject();
    const offscreen = document.createElement('canvas');
    offscreen.width = 50;
    offscreen.height = 50;
    setImageCache(obj, { canvas: offscreen, transform: createMatrix() });
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    const cache = { canvas: offscreen, transform: createMatrix() };
    const spy = vi.spyOn(state.context, 'drawImage');

    drawImageCacheResult(state, data, cache);

    expect(spy).toHaveBeenCalledOnce();
  });
});
