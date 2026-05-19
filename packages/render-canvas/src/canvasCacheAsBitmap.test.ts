import { getDisplayObjectRenderNode } from '@flighthq/render-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';

import { updateCanvasCacheBitmap } from './canvasCacheAsBitmap';
import { createCanvasRenderState } from './canvasRenderState';

describe('updateCanvasCacheBitmap', () => {
  it('does not throw (placeholder implementation)', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const obj = createDisplayObject();
    const data = getDisplayObjectRenderNode(state, obj);

    expect(() => updateCanvasCacheBitmap(state, data)).not.toThrow();
  });

  it('does not throw with force = true', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const obj = createDisplayObject();
    const data = getDisplayObjectRenderNode(state, obj);

    expect(() => updateCanvasCacheBitmap(state, data, true)).not.toThrow();
  });

  it('does not modify cacheBitmap (TODO stub)', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const obj = createDisplayObject();
    const data = getDisplayObjectRenderNode(state, obj);

    updateCanvasCacheBitmap(state, data);

    expect(data.cacheBitmap).toBeNull();
  });
});
