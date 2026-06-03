import { ImageRenderCacheKind } from '@flighthq/render';

import {
  defaultCanvasRenderImageCacheMaskRenderer,
  defaultCanvasRenderImageCacheRenderer,
  enableCanvasRenderImageCache,
} from './canvasRenderCache';
import { createCanvasRenderState } from './canvasRenderState';

function makeState() {
  return createCanvasRenderState(document.createElement('canvas'));
}

describe('defaultCanvasRenderImageCacheMaskRenderer', () => {
  it('has drawMask', () => {
    expect(typeof defaultCanvasRenderImageCacheMaskRenderer.drawMask).toBe('function');
  });
});

describe('defaultCanvasRenderImageCacheRenderer', () => {
  it('has draw and createData', () => {
    expect(typeof defaultCanvasRenderImageCacheRenderer.draw).toBe('function');
    expect(typeof defaultCanvasRenderImageCacheRenderer.createData).toBe('function');
  });
});

describe('enableCanvasRenderImageCache', () => {
  it('registers the image cache renderer for the image cache kind', () => {
    const state = makeState();
    enableCanvasRenderImageCache(state);
    expect(state.rendererMap.get(ImageRenderCacheKind)).toBe(defaultCanvasRenderImageCacheRenderer);
  });
});
