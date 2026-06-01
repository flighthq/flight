import { createImageSourceFromCanvas } from '@flighthq/assets';
import { createMatrix } from '@flighthq/geometry';
import { setImageCache } from '@flighthq/image-cache';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';

import { drawImageCacheResult } from './canvasCacheAsBitmap';
import { createCanvasRenderState } from './canvasRenderState';

describe('drawImageCacheResult', () => {
  it('does not throw when source is null', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    const cache = { source: null, transform: createMatrix() };

    expect(() => drawImageCacheResult(state, data, cache)).not.toThrow();
  });

  it('does not throw when source.src is null', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    const imageSource = createImageSourceFromCanvas(canvas);
    imageSource.src = null;
    const cache = { source: imageSource, transform: createMatrix() };

    expect(() => drawImageCacheResult(state, data, cache)).not.toThrow();
  });

  it('calls drawImage when source is set', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const obj = createDisplayObject();
    const offscreen = document.createElement('canvas');
    offscreen.width = 50;
    offscreen.height = 50;
    const imageSource = createImageSourceFromCanvas(offscreen);
    setImageCache(obj, { source: imageSource, transform: createMatrix() });
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    const spy = vi.spyOn(state.context, 'drawImage');

    drawImageCacheResult(state, data, { source: imageSource, transform: createMatrix() });

    expect(spy).toHaveBeenCalledOnce();
  });
});
