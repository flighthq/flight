import { createEntity } from '@flighthq/entity/contract';
import type { Image, RenderTexture, TextureLike, TextureSource } from '@flighthq/types/contract';
import {
  BitmapTextureSourceKind,
  CompressedImageTextureSourceKind,
  ImageTextureSourceKind,
  RenderTargetTextureSourceKind,
} from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState';
import { renderIntoGlRenderTexture } from './glRenderTexture';
import { createGlState } from './glTestHelper';
import {
  registerGlImageTextureResolver,
  registerGlBitmapTextureResolver,
  registerGlCompressedImageTextureResolver,
  registerGlRenderTextureResolver,
  registerGlTextureResolver,
  resolveGlTexture,
} from './glTextureResolver';

function textureWithImage(image: TextureSource | null): TextureLike {
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
    dimension: '2d',
    source: image,
    uvOffset: { x: 0, y: 0 },
    uvRotation: 0,
    uvScale: { x: 1, y: 1 },
    version: 0,
  } as unknown as TextureLike;
}

function imageResource(source: CanvasImageSource = document.createElement('img')): Image {
  return {
    height: 1,
    kind: ImageTextureSourceKind,
    source,
    version: 0,
    width: 1,
  } as unknown as Image;
}

function textureSource(kind: string): TextureSource {
  return {
    height: 1,
    kind,
    version: 0,
    width: 1,
  } as unknown as TextureSource;
}

function textureWithTarget(): TextureLike {
  const texture = textureWithImage(null);
  texture.colorSpace = 'linear';
  if (texture.dimension !== '2d') throw new Error('test texture must be 2d');
  texture.source = createEntity({
    colorSpace: 'linear' as const,
    height: 8,
    kind: RenderTargetTextureSourceKind,
    version: 0,
    width: 8,
  });
  return texture;
}

describe('registerGlBitmapTextureResolver', () => {
  it('registers only the Bitmap source key', () => {
    const { state } = createGlState();
    registerGlBitmapTextureResolver(state);
    expect([...getGlRenderStateRuntime(state).glTextureResolverRegistry!.keys()]).toEqual([BitmapTextureSourceKind]);
  });
});

describe('registerGlCompressedImageTextureResolver', () => {
  it('registers only the CompressedImage source key', () => {
    const { state } = createGlState();
    registerGlCompressedImageTextureResolver(state);
    expect([...getGlRenderStateRuntime(state).glTextureResolverRegistry!.keys()]).toEqual([
      CompressedImageTextureSourceKind,
    ]);
  });
});

describe('registerGlImageTextureResolver', () => {
  it('registers the 2D image matcher and resolves through the source-keyed upload cache', () => {
    const { state, gl } = createGlState();
    const texture = textureWithImage(imageResource());
    registerGlImageTextureResolver(state);

    const first = resolveGlTexture(state, texture);
    const second = resolveGlTexture(state, texture);

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(gl.texImage2D).toHaveBeenCalledOnce();
  });

  it('returns null for an unbound image source', () => {
    const { state } = createGlState();
    registerGlImageTextureResolver(state);
    expect(resolveGlTexture(state, textureWithImage(null))).toBeNull();
  });

  it('uploads a host video through the image source kind and gates by version', () => {
    const { state, gl } = createGlState();
    const video = imageResource({
      readyState: 4,
      videoHeight: 240,
      videoWidth: 320,
    } as HTMLVideoElement);
    const texture = textureWithImage(video);
    registerGlImageTextureResolver(state);

    const first = resolveGlTexture(state, texture);
    const uploads = (gl.texImage2D as ReturnType<typeof vi.fn>).mock.calls.length;
    const second = resolveGlTexture(state, texture);

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(gl.texImage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video.source);
    expect(gl.texImage2D).toHaveBeenCalledTimes(uploads);
  });
});

describe('registerGlRenderTextureResolver', () => {
  it('returns the hidden color attachment without uploading CPU pixels', () => {
    const { state, gl } = createGlState();
    const previous = vi.mocked(gl.getParameter).getMockImplementation();
    vi.mocked(gl.getParameter).mockImplementation((parameter) => {
      if (parameter === gl.VIEWPORT || parameter === gl.SCISSOR_BOX) return [0, 0, 16, 16];
      return previous?.(parameter);
    });
    const texture = textureWithTarget();
    renderIntoGlRenderTexture(state, texture as RenderTexture, () => {});
    registerGlRenderTextureResolver(state);
    const uploads = vi.mocked(gl.texImage2D).mock.calls.length;

    expect(resolveGlTexture(state, texture)).not.toBeNull();
    expect(gl.texImage2D).toHaveBeenCalledTimes(uploads);
  });
});

describe('registerGlTextureResolver', () => {
  it('keeps registrations state-scoped, replaces by string kind, and removes with null', () => {
    const { state: a } = createGlState();
    const { state: b } = createGlState();
    const sourceKind = 'acme.generated';
    const first = vi.fn(() => ({ first: true }) as unknown as WebGLTexture);
    const second = vi.fn(() => ({ second: true }) as unknown as WebGLTexture);
    const source = textureSource(sourceKind);
    const texture = textureWithImage(source);

    registerGlTextureResolver(a, sourceKind, first);
    expect(resolveGlTexture(a, texture)).not.toBeNull();
    expect(resolveGlTexture(b, texture)).toBeNull();

    registerGlTextureResolver(a, sourceKind, second);
    expect(resolveGlTexture(a, texture)).toEqual({ second: true });
    expect(getGlRenderStateRuntime(a).glTextureResolverRegistry?.size).toBe(1);

    registerGlTextureResolver(a, sourceKind, null);
    expect(resolveGlTexture(a, texture)).toBeNull();
  });

  it('uses one exact keyed lookup and does not fall through to another kind', () => {
    const { state } = createGlState();
    const image = textureSource('acme.specific');
    registerGlTextureResolver(state, 'image', () => ({ kind: 'image' }) as unknown as WebGLTexture);
    registerGlTextureResolver(state, 'acme.specific', () => ({ kind: 'specific' }) as unknown as WebGLTexture);
    expect(resolveGlTexture(state, textureWithImage(image))).toEqual({ kind: 'specific' });
  });
});

describe('resolveGlTexture', () => {
  it('returns null when the state has no registered source resolver', () => {
    const { state } = createGlState();
    expect(resolveGlTexture(state, textureWithImage(imageResource()))).toBeNull();
  });
});
