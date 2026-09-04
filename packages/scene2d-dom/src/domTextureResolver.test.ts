import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createImageResource } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { TextureSource } from '@flighthq/types/contract';

import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';
import { registerDomTextureResolver, resolveDomTexture } from './domTextureResolver';

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
    expect(beforeRemoval.entries.get('acme.test')).toEqual({ state: 'bound', value: resolver });
  });

  it('replaces the persistent table without mutating an earlier snapshot', () => {
    const state = createDomRenderState(document.createElement('div'));
    const before = getDomRenderStateRuntime(state).registries.textureResolvers;
    const resolver = (): null => null;

    registerDomTextureResolver(state, 'acme.persistent', resolver);

    const after = getDomRenderStateRuntime(state).registries.textureResolvers;
    expect(after).not.toBe(before);
    expect(before.entries.size).toBe(0);
    expect(after.entries.get('acme.persistent')).toEqual({ state: 'bound', value: resolver });
  });

  it('is last-write-wins without mutating the registered snapshot', () => {
    const state = createDomRenderState(document.createElement('div'));
    const first = (): null => null;
    const second = (): null => null;
    registerDomTextureResolver(state, 'acme.replace', first);
    const before = getDomRenderStateRuntime(state).registries.textureResolvers;

    registerDomTextureResolver(state, 'acme.replace', second);

    expect(before.entries.get('acme.replace')).toEqual({ state: 'bound', value: first });
    expect(getDomRenderStateRuntime(state).registries.textureResolvers.entries.get('acme.replace')).toEqual({
      state: 'bound',
      value: second,
    });
  });
});

describe('resolveDomTexture', () => {
  it('returns null without a matching resolver', () => {
    const state = createDomRenderState(document.createElement('div'));
    const image = createImageResource(globalThis.document.createElement('img'));
    expect(resolveDomTexture(state, createTexture({ dimension: '2d', source: image }))).toBeNull();
  });
});
