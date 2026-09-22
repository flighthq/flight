import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  createImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { TextureSource } from '@flighthq/types/contract';

import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';
import { registerDomTextureResolver, resolveDomTexture } from './domTextureResolver';

// A test that wraps a host handle supplies the host: the resource measures through the registered
// resolver, and clearing after each test keeps this file from covering for another's missing one.
beforeEach(() => {
  registerTestImageDimensionResolver();
});

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

describe('registerDomTextureResolver', () => {
  it('registers and removes one state-scoped resolver', () => {
    const state = createDomRenderState(document.createElement('div'));
    const textureSource = allocateEntity<any>();
    textureSource.height = 1;
    textureSource.kind = 'acme.test';
    textureSource.version = 0;
    textureSource.width = 1;
    const texture = createTexture({ dimension: '2d', source: finishEntity(textureSource) as TextureSource });
    const canvas = document.createElement('canvas');
    const resolver = (): HTMLCanvasElement => canvas;
    registerDomTextureResolver(state, 'acme.test', resolver);
    expect(resolveDomTexture(state, texture)).toBe(canvas);
    const beforeRemoval = getDomRenderStateRuntime(state).registries.textureResolvers;
    registerDomTextureResolver(state, 'acme.test', null);
    expect(resolveDomTexture(state, texture)).toBeNull();
    expect(beforeRemoval.get('acme.test')).toBe(resolver);
  });

  it('replaces the persistent table without mutating an earlier snapshot', () => {
    const state = createDomRenderState(document.createElement('div'));
    const before = getDomRenderStateRuntime(state).registries.textureResolvers;
    const resolver = (): null => null;

    registerDomTextureResolver(state, 'acme.persistent', resolver);

    const after = getDomRenderStateRuntime(state).registries.textureResolvers;
    expect(after).not.toBe(before);
    expect(before.size).toBe(0);
    expect(after.get('acme.persistent')).toBe(resolver);
  });

  it('is last-write-wins without mutating the registered snapshot', () => {
    const state = createDomRenderState(document.createElement('div'));
    const first = (): null => null;
    const second = (): null => null;
    registerDomTextureResolver(state, 'acme.replace', first);
    const before = getDomRenderStateRuntime(state).registries.textureResolvers;

    registerDomTextureResolver(state, 'acme.replace', second);

    expect(before.get('acme.replace')).toBe(first);
    expect(getDomRenderStateRuntime(state).registries.textureResolvers.get('acme.replace')).toBe(second);
  });
});

describe('resolveDomTexture', () => {
  it('returns null without a matching resolver', () => {
    const state = createDomRenderState(document.createElement('div'));
    const image = createImageResource(globalThis.document.createElement('img'));
    expect(resolveDomTexture(state, createTexture({ dimension: '2d', source: image }))).toBeNull();
  });
});
