import { createImageResource } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';

import { createCanvasRenderState } from './canvasRenderState';
import { registerCanvasTextureResolver, resolveCanvasTexture } from './canvasTextureResolver';

describe('registerCanvasTextureResolver', () => {
  it('registers and removes one state-scoped resolver', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const image = createImageResource(document.createElement('img'));
    image.kind = 'acme.test';
    const texture = createTexture({ storage: { dimension: '2d', image } });
    const source = document.createElement('canvas');
    registerCanvasTextureResolver(state, image.kind, () => source);
    expect(resolveCanvasTexture(state, texture)).toBe(source);
    registerCanvasTextureResolver(state, image.kind, null);
    expect(resolveCanvasTexture(state, texture)).toBeNull();
  });
});

describe('resolveCanvasTexture', () => {
  it('returns null without a matching resolver', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const image = createImageResource(document.createElement('img'));
    expect(resolveCanvasTexture(state, createTexture({ storage: { dimension: '2d', image } }))).toBeNull();
  });
});
