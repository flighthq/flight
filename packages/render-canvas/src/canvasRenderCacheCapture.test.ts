import { getImageRenderCache } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene-display';

import { enableCanvasRenderImageCache } from './canvasRenderCache';
import {
  beginDisplayObjectImageRenderCacheCapture,
  captureDisplayObjectRenderImageCache,
  endDisplayObjectImageRenderCacheCapture,
} from './canvasRenderCacheCapture';
import { createCanvasRenderState } from './canvasRenderState';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const state = createCanvasRenderState(canvas);
  enableCanvasRenderImageCache(state);
  return state;
}

describe('beginDisplayObjectImageRenderCacheCapture', () => {
  it('does not throw for a display object with zero bounds', () => {
    const state = makeState();
    const obj = createDisplayObject();
    expect(() => beginDisplayObjectImageRenderCacheCapture(state, obj)).not.toThrow();
  });

  it('sets renderTransform2D on the state', () => {
    const state = makeState();
    const obj = createDisplayObject();
    beginDisplayObjectImageRenderCacheCapture(state, obj);
    expect(state.renderTransform2D).not.toBeNull();
  });
});

describe('captureDisplayObjectRenderImageCache', () => {
  it('does not throw for a display object', () => {
    const state = makeState();
    const obj = createDisplayObject();
    expect(() => captureDisplayObjectRenderImageCache(state, obj)).not.toThrow();
  });

  it('sets an image render cache on the source after capture', () => {
    const state = makeState();
    const obj = createDisplayObject();
    captureDisplayObjectRenderImageCache(state, obj);
    expect(getImageRenderCache(obj as any)).not.toBeNull();
  });

  it('accepts padding and min size options', () => {
    const state = makeState();
    const obj = createDisplayObject();
    expect(() =>
      captureDisplayObjectRenderImageCache(state, obj, { padding: 2, minWidth: 4, minHeight: 4 }),
    ).not.toThrow();
  });

  it('reuses the existing image source when called a second time', () => {
    const state = makeState();
    const obj = createDisplayObject();
    captureDisplayObjectRenderImageCache(state, obj);
    const firstSource = getImageRenderCache(obj as any)?.source;
    captureDisplayObjectRenderImageCache(state, obj);
    const secondSource = getImageRenderCache(obj as any)?.source;
    expect(secondSource).toBe(firstSource);
  });
});

describe('endDisplayObjectImageRenderCacheCapture', () => {
  it('does not throw after begin', () => {
    const state = makeState();
    const obj = createDisplayObject();
    beginDisplayObjectImageRenderCacheCapture(state, obj);
    expect(() => endDisplayObjectImageRenderCacheCapture(state, obj)).not.toThrow();
  });

  it('sets an image render cache on the source', () => {
    const state = makeState();
    const obj = createDisplayObject();
    beginDisplayObjectImageRenderCacheCapture(state, obj);
    endDisplayObjectImageRenderCacheCapture(state, obj);
    expect(getImageRenderCache(obj as any)).not.toBeNull();
  });
});
