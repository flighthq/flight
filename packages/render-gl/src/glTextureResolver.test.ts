import type { ImageResource, TextureLike } from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState';
import { createGlState } from './glTestHelper';
import {
  glImageTextureBackingKind,
  registerGlImageTextureResolver,
  registerGlTextureResolver,
  resolveGlTexture,
} from './glTextureResolver';

function textureWithImage(image: ImageResource | null): TextureLike {
  return {
    colorSpace: 'srgb',
    flipX: false,
    flipY: false,
    resource: null,
    sampler: {
      anisotropy: 1,
      magFilter: 'linear',
      minFilter: 'linear',
      mipmaps: false,
      wrapU: 'clamp-to-edge',
      wrapV: 'clamp-to-edge',
    },
    storage: { dimension: '2d', image },
    uvOffset: { x: 0, y: 0 },
    uvRotation: 0,
    uvScale: { x: 1, y: 1 },
    version: 0,
  } as unknown as TextureLike;
}

function imageResource(): ImageResource {
  return {
    alphaType: 'straight',
    compressed: null,
    data: null,
    format: 'rgba8unorm',
    height: 1,
    source: document.createElement('img'),
    version: 0,
    width: 1,
  } as ImageResource;
}

describe('glImageTextureBackingKind', () => {
  it('matches only a bound 2D image storage', () => {
    expect(glImageTextureBackingKind(textureWithImage(imageResource()).storage)).toBe(true);
    expect(glImageTextureBackingKind(textureWithImage(null).storage)).toBe(false);
  });
});

describe('registerGlImageTextureResolver', () => {
  it('registers the 2D image matcher and resolves through the backing-keyed upload cache', () => {
    const { state, gl } = createGlState();
    const texture = textureWithImage(imageResource());
    registerGlImageTextureResolver(state);

    const first = resolveGlTexture(state, texture);
    const second = resolveGlTexture(state, texture);

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(gl.texImage2D).toHaveBeenCalledOnce();
  });

  it('returns null for an unbound or pixel-empty image backing', () => {
    const { state } = createGlState();
    registerGlImageTextureResolver(state);
    expect(resolveGlTexture(state, textureWithImage(null))).toBeNull();
    const empty = imageResource();
    empty.source = null;
    expect(resolveGlTexture(state, textureWithImage(empty))).toBeNull();
  });
});

describe('registerGlTextureResolver', () => {
  it('keeps registrations state-scoped, replaces by matcher identity, and removes with null', () => {
    const { state: a } = createGlState();
    const { state: b } = createGlState();
    const backingKind = (): boolean => true;
    const first = vi.fn(() => ({ first: true }) as unknown as WebGLTexture);
    const second = vi.fn(() => ({ second: true }) as unknown as WebGLTexture);
    const texture = textureWithImage(null);

    registerGlTextureResolver(a, backingKind, first);
    expect(resolveGlTexture(a, texture)).not.toBeNull();
    expect(resolveGlTexture(b, texture)).toBeNull();

    registerGlTextureResolver(a, backingKind, second);
    expect(resolveGlTexture(a, texture)).toEqual({ second: true });
    expect(getGlRenderStateRuntime(a).glTextureResolverRegistry).toHaveLength(1);

    registerGlTextureResolver(a, backingKind, null);
    expect(resolveGlTexture(a, texture)).toBeNull();
  });

  it('lets the newest matching backing resolver override a general matcher', () => {
    const { state } = createGlState();
    const general = (): boolean => true;
    const specific = (): boolean => true;
    registerGlTextureResolver(state, general, () => ({ kind: 'general' }) as unknown as WebGLTexture);
    registerGlTextureResolver(state, specific, () => ({ kind: 'specific' }) as unknown as WebGLTexture);
    expect(resolveGlTexture(state, textureWithImage(null))).toEqual({ kind: 'specific' });
  });
});

describe('resolveGlTexture', () => {
  it('returns null when the state has no registered backing resolver', () => {
    const { state } = createGlState();
    expect(resolveGlTexture(state, textureWithImage(imageResource()))).toBeNull();
  });
});
