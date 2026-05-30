import { createMatrix, setRectangle } from '@flighthq/geometry';
import { getDisplayObjectRenderNode } from '@flighthq/render-core';
import { getLocalBoundsRect } from '@flighthq/scenegraph-core';
import { createDisplayObject, getDisplayObjectRuntime } from '@flighthq/scenegraph-display';

import { drawImageCacheResult, renderToImageCache } from './canvasCacheAsBitmap';
import { createCanvasRenderState } from './canvasRenderState';

function makeStateAndObj() {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const state = createCanvasRenderState(canvas);
  const obj = createDisplayObject();
  setRectangle(getLocalBoundsRect(obj), 0, 0, 50, 50);
  return { state, obj };
}

describe('drawImageCacheResult', () => {
  it('does not throw when canvas is null', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const obj = createDisplayObject();
    const data = getDisplayObjectRenderNode(state, obj);
    const cache = { canvas: null, transform: createMatrix() };

    expect(() => drawImageCacheResult(state, data, cache)).not.toThrow();
  });

  it('calls drawImage when canvas is set', () => {
    const { state, obj } = makeStateAndObj();
    renderToImageCache(state, obj, null, 0xff0000);
    const data = getDisplayObjectRenderNode(state, obj);
    const cache = getDisplayObjectRuntime(obj).imageCache!;
    const spy = vi.spyOn(state.context, 'drawImage');

    drawImageCacheResult(state, data, cache);

    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('renderToImageCache', () => {
  it('does not throw when bounds are zero', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const obj = createDisplayObject();

    expect(() => renderToImageCache(state, obj)).not.toThrow();
  });

  it('sets imageCache slot with a canvas when bounds are non-zero', () => {
    const { state, obj } = makeStateAndObj();

    renderToImageCache(state, obj, null, 0xff0000);

    const cache = getDisplayObjectRuntime(obj).imageCache;
    expect(cache).not.toBeNull();
    expect(cache!.canvas).not.toBeNull();
  });

  it('clears the slot when bounds are zero', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const obj = createDisplayObject();

    renderToImageCache(state, obj);

    expect(getDisplayObjectRuntime(obj).imageCache).toBeNull();
  });

  it('stores identity-like transform when matrix is null', () => {
    const { state, obj } = makeStateAndObj();

    renderToImageCache(state, obj);

    const cache = getDisplayObjectRuntime(obj).imageCache;
    expect(cache!.transform.a).toBeCloseTo(1);
    expect(cache!.transform.d).toBeCloseTo(1);
    expect(cache!.transform.b).toBeCloseTo(0);
    expect(cache!.transform.c).toBeCloseTo(0);
  });
});
