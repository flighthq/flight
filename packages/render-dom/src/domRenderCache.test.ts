import { ImageRenderCacheKind } from '@flighthq/render';

import {
  defaultDOMRenderImageCacheMaskRenderer,
  defaultDOMRenderImageCacheRenderer,
  enableDOMRenderImageCache,
} from './domRenderCache';
import { createDOMRenderState } from './domRenderState';

function makeState() {
  return createDOMRenderState(document.createElement('div'));
}

describe('defaultDOMRenderImageCacheMaskRenderer', () => {
  it('has drawMask', () => {
    expect(typeof defaultDOMRenderImageCacheMaskRenderer.drawMask).toBe('function');
  });
});

describe('defaultDOMRenderImageCacheRenderer', () => {
  it('has draw and createData', () => {
    expect(typeof defaultDOMRenderImageCacheRenderer.draw).toBe('function');
    expect(typeof defaultDOMRenderImageCacheRenderer.createData).toBe('function');
  });
});

describe('enableDOMRenderImageCache', () => {
  it('registers the image cache renderer for the image cache kind', () => {
    const state = makeState();
    enableDOMRenderImageCache(state);
    expect(state.rendererMap.get(ImageRenderCacheKind)).toBe(defaultDOMRenderImageCacheRenderer);
  });
});
