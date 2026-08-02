import { createImageResource } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { TextureSource } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import { getCanvasRenderStateTextureResolvers } from './canvasRenderState';
import { createCanvasRenderState } from './canvasRenderState';
import {
  createCanvasTextureResolvers,
  registerCanvasTextureResolver,
  resolveCanvasTexture,
} from './canvasTextureResolver';

describe('createCanvasTextureResolvers', () => {
  it('starts empty, so a set resolves exactly what was registered on it', () => {
    const resolvers = createCanvasTextureResolvers();

    expect(resolvers.registry).toBeNull();
    expect(resolveCanvasTexture(resolvers, createTexture())).toBeNull();
  });

  it('is independent of every other set, so two backends can hold their own', () => {
    const first = createCanvasTextureResolvers();
    const second = createCanvasTextureResolvers();

    registerCanvasTextureResolver(first, BitmapTextureSourceKind, () => null);

    expect(first.registry?.has(BitmapTextureSourceKind)).toBe(true);
    expect(second.registry).toBeNull();
  });
});

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
    registerCanvasTextureResolver(getCanvasRenderStateTextureResolvers(state), 'acme.test', () => canvas);
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture)).toBe(canvas);
    registerCanvasTextureResolver(getCanvasRenderStateTextureResolvers(state), 'acme.test', null);
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture)).toBeNull();
  });
});

describe('resolveCanvasTexture', () => {
  it('returns null without a matching resolver', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const image = createImageResource(globalThis.document.createElement('img'));
    expect(
      resolveCanvasTexture(
        getCanvasRenderStateTextureResolvers(state),
        createTexture({ dimension: '2d', source: image }),
      ),
    ).toBeNull();
  });
});
