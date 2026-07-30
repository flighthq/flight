import { createImageResource } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { TextureSource } from '@flighthq/types/contract';

import { createCanvasRenderState } from './canvasRenderState';
import { registerCanvasTextureResolver, resolveCanvasTexture } from './canvasTextureResolver';

describe('registerCanvasTextureResolver', () => {
  it('registers and removes one state-scoped resolver', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const textureSource = {
      height: 1,
      kind: 'acme.test',
      version: 0,
      width: 1,
    } as unknown as TextureSource;
    const texture = createTexture({ dimension: '2d', source: textureSource });
    const canvas = document.createElement('canvas');
    registerCanvasTextureResolver(state, 'acme.test', () => canvas);
    expect(resolveCanvasTexture(state, texture)).toBe(canvas);
    registerCanvasTextureResolver(state, 'acme.test', null);
    expect(resolveCanvasTexture(state, texture)).toBeNull();
  });
});

describe('resolveCanvasTexture', () => {
  it('returns null without a matching resolver', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const image = createImageResource(globalThis.document.createElement('img'));
    expect(resolveCanvasTexture(state, createTexture({ dimension: '2d', source: image }))).toBeNull();
  });
});
