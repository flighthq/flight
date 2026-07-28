import type { ImageResource, Texture } from '@flighthq/types/contract';
import {
  BitmapTextureBackingKind,
  CompressedImageTextureBackingKind,
  ImageTextureBackingKind,
  RenderTextureBackingKind,
  VideoTextureBackingKind,
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
  registerWgpuTextureResolver,
  registerWgpuVideoTextureResolver,
  resolveWgpuTexture,
} from './wgpuTextureResolver';

beforeAll(() => {
  installWgpuMock();
});

function imageResource(
  kind = ImageTextureBackingKind,
  source: CanvasImageSource = document.createElement('canvas'),
): ImageResource {
  return {
    height: 4,
    kind,
    source,
    version: 0,
    width: 4,
  } as unknown as ImageResource;
}

function textureWithImage(image: ImageResource | null): Texture {
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
    storage: { dimension: '2d', image },
    uvOffset: { x: 0, y: 0 },
    uvRotation: 0,
    uvScale: { x: 1, y: 1 },
    version: 0,
  } as Texture;
}

function renderTexture(): Texture {
  const texture = textureWithImage(null);
  texture.colorSpace = 'linear';
  texture.storage.target = { height: 8, kind: RenderTextureBackingKind, width: 8 };
  return texture;
}

describe('registerWgpuBitmapTextureResolver', () => {
  it('registers only the Bitmap backing key', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuBitmapTextureResolver(state);
    expect([...getWgpuRenderStateRuntime(state).wgpuTextureResolverRegistry!.keys()]).toEqual([
      BitmapTextureBackingKind,
    ]);
  });
});

describe('registerWgpuCompressedImageTextureResolver', () => {
  it('registers only the CompressedImage backing key', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuCompressedImageTextureResolver(state);
    expect([...getWgpuRenderStateRuntime(state).wgpuTextureResolverRegistry!.keys()]).toEqual([
      CompressedImageTextureBackingKind,
    ]);
  });
});

describe('registerWgpuImageTextureResolver', () => {
  it('resolves and caches a declared still-image backing', async () => {
    const state = await createWgpuRenderStateForTest();
    const texture = textureWithImage(imageResource());
    registerWgpuImageTextureResolver(state);

    const first = resolveWgpuTexture(state, texture);
    expect(first).not.toBeNull();
    expect(resolveWgpuTexture(state, texture)).toBe(first);
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
    const image = imageResource();
    image.kind = 'acme.generated';
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

describe('registerWgpuVideoTextureResolver', () => {
  it('resolves a ready declared video backing without structural dispatch', async () => {
    const state = await createWgpuRenderStateForTest();
    const image = imageResource(VideoTextureBackingKind, {
      readyState: 4,
      videoHeight: 8,
      videoWidth: 8,
    } as HTMLVideoElement);
    const texture = textureWithImage(image);
    registerWgpuVideoTextureResolver(state);
    expect(resolveWgpuTexture(state, texture)).not.toBeNull();
  });
});

describe('resolveWgpuTexture', () => {
  it('returns null without an exact registered backing kind', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(resolveWgpuTexture(state, textureWithImage(null))).toBeNull();
  });
});
