import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { getRegistryTableKeys } from '@flighthq/registry/contract';
import type { ImageResource, RenderTexture, Texture, TextureSource } from '@flighthq/types/contract';
import {
  BitmapTextureSourceKind,
  CompressedImageTextureSourceKind,
  ImageTextureSourceKind,
  RenderTargetTextureSourceKind,
} from '@flighthq/types/contract';

import { renderWgpuBackground, submitWgpuRenderPass } from './wgpuBackground';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { renderIntoWgpuRenderTexture } from './wgpuRenderTexture';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';
import {
  registerWgpuImageTextureResolver,
  registerWgpuBitmapTextureResolver,
  registerWgpuCompressedImageTextureResolver,
  registerWgpuRenderTextureResolver,
  registerStandardWgpuTextureResolvers,
  registerWgpuTextureResolver,
  resolveWgpuTexture,
} from './wgpuTextureResolver';

beforeAll(() => {
  installWgpuMock();
});

function imageResource(source: CanvasImageSource = document.createElement('canvas')): ImageResource {
  return {
    height: 4,
    alphaType: 'straight',
    gamut: 'srgb',
    kind: ImageTextureSourceKind,
    source,
    version: 0,
    width: 4,
  } as unknown as ImageResource;
}

function textureSource(kind: string): TextureSource {
  return {
    height: 4,
    kind,
    version: 0,
    width: 4,
  } as unknown as TextureSource;
}

function textureWithImage(image: TextureSource | null): Texture {
  return {
    colorSpace: 'srgb',
    flipX: false,
    flipY: false,
    sampler: {
      anisotropy: 1,
      magFilter: 'linear',
      minFilter: 'linear',
      mipmaps: false,
      wrapU: 'clamp-to-edge',
      wrapV: 'clamp-to-edge',
    },
    dimension: '2d',
    source: image,
    uvOffset: { x: 0, y: 0 },
    uvRotation: 0,
    uvScale: { x: 1, y: 1 },
    version: 0,
  } as unknown as Texture;
}

function renderTexture(): RenderTexture {
  const texture = textureWithImage(null);
  texture.colorSpace = 'linear';
  if (texture.dimension !== '2d') throw new Error('test texture must be 2d');
    const _entity = allocateEntity<ImageResource>();
  _entity.alphaType = 'straight' as const;
  _entity.gamut = 'srgb' as const;
  _entity.height = 8;
  _entity.kind = RenderTargetTextureSourceKind;
  _entity.version = 0;
  _entity.width = 8;
  texture.source = finishEntity(_entity);
  return texture as RenderTexture;
}

function registeredTextureSourceKinds(state: Parameters<typeof getWgpuRenderStateRuntime>[0]): string[] {
  const kinds: string[] = [];
  getRegistryTableKeys(kinds, getWgpuRenderStateRuntime(state).registries.textureResolvers);
  return kinds;
}

describe('registerStandardWgpuTextureResolvers', () => {
  it('registers bitmap, image, and render texture sources without compressed images', async () => {
    const state = await createWgpuRenderStateForTest();
    registerStandardWgpuTextureResolvers(state);
    expect(registeredTextureSourceKinds(state)).toEqual([
      BitmapTextureSourceKind,
      ImageTextureSourceKind,
      RenderTargetTextureSourceKind,
    ]);
  });
});

describe('registerWgpuBitmapTextureResolver', () => {
  it('registers only the Bitmap source key', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuBitmapTextureResolver(state);
    expect(registeredTextureSourceKinds(state)).toEqual([BitmapTextureSourceKind]);
  });
});

describe('registerWgpuCompressedImageTextureResolver', () => {
  it('registers only the CompressedImageResource source key', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuCompressedImageTextureResolver(state);
    expect(registeredTextureSourceKinds(state)).toEqual([CompressedImageTextureSourceKind]);
  });
});

describe('registerWgpuImageTextureResolver', () => {
  it('resolves and caches a declared still-image source', async () => {
    const state = await createWgpuRenderStateForTest();
    const texture = textureWithImage(imageResource());
    registerWgpuImageTextureResolver(state);

    const first = resolveWgpuTexture(state, texture);
    expect(first).not.toBeNull();
    expect(resolveWgpuTexture(state, texture)).toBe(first);
  });

  // The sample format comes from the PAIR (what the content is, what the destination composites in), not
  // from an override. One sRGB texture therefore realizes two ways: decoded for a linear-working path
  // (3D), byte-through for an encoded-working one (2D), cached apart so both can be live at once.
  it('derives the sample format from the texture and working color spaces', async () => {
    const state = await createWgpuRenderStateForTest();
    const createTexture = vi.spyOn(state.device, 'createTexture');
    const texture = textureWithImage(imageResource());
    registerWgpuImageTextureResolver(state);

    const decoded = resolveWgpuTexture(state, texture, false, 'linear');
    expect(createTexture).toHaveBeenLastCalledWith(expect.objectContaining({ format: 'rgba8unorm-srgb' }));

    const byteThrough = resolveWgpuTexture(state, texture, false, 'srgb');
    expect(byteThrough).not.toBe(decoded);
    expect(createTexture).toHaveBeenLastCalledWith(expect.objectContaining({ format: 'rgba8unorm' }));

    // Linear content never decodes, whichever space the destination works in.
    const linearTexture = textureWithImage(imageResource());
    (linearTexture as { colorSpace: string }).colorSpace = 'linear';
    resolveWgpuTexture(state, linearTexture, false, 'linear');
    expect(createTexture).toHaveBeenLastCalledWith(expect.objectContaining({ format: 'rgba8unorm' }));

    expect(resolveWgpuTexture(state, texture, false, 'linear')).toBe(decoded);
  });

  it('resolves a host video through the image source kind', async () => {
    const state = await createWgpuRenderStateForTest();
    const source = document.createElement('video');
    Object.defineProperties(source, {
      readyState: { value: 4 },
      videoHeight: { value: 8 },
      videoWidth: { value: 8 },
    });
    const image = imageResource(source);
    const texture = textureWithImage(image);
    registerWgpuImageTextureResolver(state);
    expect(resolveWgpuTexture(state, texture)).not.toBeNull();
  });
});

describe('registerWgpuRenderTextureResolver', () => {
  it('returns a render target only after it has been rendered', async () => {
    const state = await createWgpuRenderStateForTest();
    const texture = renderTexture();
    registerWgpuRenderTextureResolver(state);
    expect(resolveWgpuTexture(state, texture)).toBeNull();

    renderWgpuBackground(state);
    renderIntoWgpuRenderTexture(state, texture, () => {});
    expect(resolveWgpuTexture(state, texture)).not.toBeNull();
    submitWgpuRenderPass(state);
  });
});

describe('registerWgpuTextureResolver', () => {
  it('is state-scoped, last-write-wins by string kind, and removable', async () => {
    const a = await createWgpuRenderStateForTest();
    const b = await createWgpuRenderStateForTest();
    const image = textureSource('acme.generated');
    const texture = textureWithImage(image);
    const first = vi.fn(() => ({ first: true }) as never);
    const second = vi.fn(() => ({ second: true }) as never);

    registerWgpuTextureResolver(a, image.kind, first);
    expect(resolveWgpuTexture(a, texture)).toEqual({ first: true });
    expect(resolveWgpuTexture(b, texture)).toBeNull();

    registerWgpuTextureResolver(a, image.kind, second);
    expect(resolveWgpuTexture(a, texture)).toEqual({ second: true });

    registerWgpuTextureResolver(a, image.kind, null);
    expect(resolveWgpuTexture(a, texture)).toBeNull();
  });
});

describe('resolveWgpuTexture', () => {
  it('returns null without an exact registered source kind', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(resolveWgpuTexture(state, textureWithImage(null))).toBeNull();
  });
});
