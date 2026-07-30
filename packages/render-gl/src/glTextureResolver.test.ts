import type { ImageResource, RenderTexture, TextureLike } from '@flighthq/types/contract';
import {
  BitmapTextureBackingKind,
  CompressedImageTextureBackingKind,
  ImageTextureBackingKind,
  RenderTextureBackingKind,
  VideoTextureBackingKind,
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
  registerGlVideoTextureResolver,
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

function imageResource(
  source: CanvasImageSource = document.createElement('img'),
  kind = ImageTextureBackingKind,
): ImageResource {
  return {
    height: 1,
    kind,
    source,
    version: 0,
    width: 1,
  } as unknown as ImageResource;
}

function textureWithTarget(): TextureLike {
  const texture = textureWithImage(null);
  texture.colorSpace = 'linear';
  texture.storage.target = { colorSpace: 'linear', height: 8, kind: RenderTextureBackingKind, width: 8 };
  return texture;
}

describe('registerGlBitmapTextureResolver', () => {
  it('registers only the Bitmap backing key', () => {
    const { state } = createGlState();
    registerGlBitmapTextureResolver(state);
    expect([...getGlRenderStateRuntime(state).glTextureResolverRegistry!.keys()]).toEqual([BitmapTextureBackingKind]);
  });
});

describe('registerGlCompressedImageTextureResolver', () => {
  it('registers only the CompressedImage backing key', () => {
    const { state } = createGlState();
    registerGlCompressedImageTextureResolver(state);
    expect([...getGlRenderStateRuntime(state).glTextureResolverRegistry!.keys()]).toEqual([
      CompressedImageTextureBackingKind,
    ]);
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

  it('returns null for an unbound image backing', () => {
    const { state } = createGlState();
    registerGlImageTextureResolver(state);
    expect(resolveGlTexture(state, textureWithImage(null))).toBeNull();
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
    const backingKind = 'acme.generated';
    const first = vi.fn(() => ({ first: true }) as unknown as WebGLTexture);
    const second = vi.fn(() => ({ second: true }) as unknown as WebGLTexture);
    const image = imageResource();
    image.kind = backingKind;
    const texture = textureWithImage(image);

    registerGlTextureResolver(a, backingKind, first);
    expect(resolveGlTexture(a, texture)).not.toBeNull();
    expect(resolveGlTexture(b, texture)).toBeNull();

    registerGlTextureResolver(a, backingKind, second);
    expect(resolveGlTexture(a, texture)).toEqual({ second: true });
    expect(getGlRenderStateRuntime(a).glTextureResolverRegistry?.size).toBe(1);

    registerGlTextureResolver(a, backingKind, null);
    expect(resolveGlTexture(a, texture)).toBeNull();
  });

  it('uses one exact keyed lookup and does not fall through to another kind', () => {
    const { state } = createGlState();
    const image = imageResource();
    image.kind = 'acme.specific';
    registerGlTextureResolver(state, 'image', () => ({ kind: 'image' }) as unknown as WebGLTexture);
    registerGlTextureResolver(state, 'acme.specific', () => ({ kind: 'specific' }) as unknown as WebGLTexture);
    expect(resolveGlTexture(state, textureWithImage(image))).toEqual({ kind: 'specific' });
  });
});

describe('registerGlVideoTextureResolver', () => {
  it('specializes the general image resolver and gates uploads by backing version', () => {
    const { state, gl } = createGlState();
    const video = imageResource(
      { readyState: 4, videoHeight: 240, videoWidth: 320 } as HTMLVideoElement,
      VideoTextureBackingKind,
    );
    const texture = textureWithImage(video);
    registerGlImageTextureResolver(state);
    registerGlVideoTextureResolver(state);

    const first = resolveGlTexture(state, texture);
    const uploads = (gl.texImage2D as ReturnType<typeof vi.fn>).mock.calls.length;
    const second = resolveGlTexture(state, texture);

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(gl.texImage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video.source);
    expect(gl.texImage2D).toHaveBeenCalledTimes(uploads);
  });
});

describe('resolveGlTexture', () => {
  it('returns null when the state has no registered backing resolver', () => {
    const { state } = createGlState();
    expect(resolveGlTexture(state, textureWithImage(imageResource()))).toBeNull();
  });
});
