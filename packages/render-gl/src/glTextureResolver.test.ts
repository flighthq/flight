import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { getRegistryTableKeys } from '@flighthq/registry/contract';
import type { ImageResource, RenderTexture, TextureLike, TextureSource } from '@flighthq/types/contract';
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
  registerStandardGlTextureResolvers,
  registerGlTextureResolver,
  resolveGlTexture,
  standardGlTextureResolvers,
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

function imageResource(source: CanvasImageSource = document.createElement('img')): ImageResource {
  return {
    height: 1,
    alphaType: 'straight',
    gamut: 'srgb',
    kind: ImageTextureSourceKind,
    source,
    version: 0,
    width: 1,
  } as unknown as ImageResource;
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
    const _entity = allocateEntity<TextureLike>();
  _entity.colorSpace = 'linear' as const;
  _entity.alphaType = 'straight' as const;
  _entity.gamut = 'srgb' as const;
  _entity.height = 8;
  _entity.kind = RenderTargetTextureSourceKind;
  _entity.version = 0;
  _entity.width = 8;
  texture.source = finishEntity(_entity);
  return texture;
}

function registeredTextureSourceKinds(state: Parameters<typeof getGlRenderStateRuntime>[0]): string[] {
  const kinds: string[] = [];
  getRegistryTableKeys(kinds, getGlRenderStateRuntime(state).registries.textureResolvers);
  return kinds;
}

describe('registerGlBitmapTextureResolver', () => {
  it('registers only the Bitmap source key', () => {
    const { state } = createGlState();
    registerGlBitmapTextureResolver(state);
    expect(registeredTextureSourceKinds(state)).toEqual([BitmapTextureSourceKind]);
  });
});

describe('registerGlCompressedImageTextureResolver', () => {
  it('registers only the CompressedImageResource source key', () => {
    const { state } = createGlState();
    registerGlCompressedImageTextureResolver(state);
    expect(registeredTextureSourceKinds(state)).toEqual([CompressedImageTextureSourceKind]);
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

  // The sample format comes from the PAIR (what the content is, what the destination composites in), not
  // from an override. One sRGB texture therefore realizes two ways: decoded for a linear-working path
  // (3D), byte-through for an encoded-working one (2D), cached apart so both can be live at once.
  it('derives the sample format from the texture and working color spaces', () => {
    const { state, gl } = createGlState();
    const texture = textureWithImage(imageResource());
    registerGlImageTextureResolver(state);

    const decoded = resolveGlTexture(state, texture, false, 'linear');
    expect(gl.texImage2D).toHaveBeenLastCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.SRGB8_ALPHA8,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      expect.anything(),
    );

    const byteThrough = resolveGlTexture(state, texture, false, 'srgb');
    expect(byteThrough).not.toBe(decoded);
    expect(gl.texImage2D).toHaveBeenLastCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      expect.anything(),
    );

    // Linear content never decodes, whichever space the destination works in.
    const linearTexture = textureWithImage(imageResource());
    (linearTexture as { colorSpace: string }).colorSpace = 'linear';
    resolveGlTexture(state, linearTexture, false, 'linear');
    expect(gl.texImage2D).toHaveBeenLastCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      expect.anything(),
    );

    expect(resolveGlTexture(state, texture, false, 'linear')).toBe(decoded);
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
    expect(gl.texImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.SRGB8_ALPHA8,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      video.source,
    );
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
    const firstTexture = { first: true } as unknown as WebGLTexture;
    const secondTexture = { second: true } as unknown as WebGLTexture;
    const first = vi.fn(() => ({ straightAlpha: false, texture: firstTexture }));
    const second = vi.fn(() => ({ straightAlpha: false, texture: secondTexture }));
    const source = textureSource(sourceKind);
    const texture = textureWithImage(source);

    registerGlTextureResolver(a, sourceKind, first);
    expect(resolveGlTexture(a, texture)).not.toBeNull();
    expect(resolveGlTexture(b, texture)).toBeNull();

    registerGlTextureResolver(a, sourceKind, second);
    expect(resolveGlTexture(a, texture)).toBe(secondTexture);
    expect(getGlRenderStateRuntime(a).registries.textureResolvers.entries.size).toBe(1);

    registerGlTextureResolver(a, sourceKind, null);
    expect(resolveGlTexture(a, texture)).toBeNull();
  });

  it('uses one exact keyed lookup and does not fall through to another kind', () => {
    const { state } = createGlState();
    const image = textureSource('acme.specific');
    const imageTexture = { kind: 'image' } as unknown as WebGLTexture;
    const specificTexture = { kind: 'specific' } as unknown as WebGLTexture;
    registerGlTextureResolver(state, 'image', () => ({ straightAlpha: false, texture: imageTexture }));
    registerGlTextureResolver(state, 'acme.specific', () => ({ straightAlpha: false, texture: specificTexture }));
    expect(resolveGlTexture(state, textureWithImage(image))).toBe(specificTexture);
  });
});

describe('registerStandardGlTextureResolvers', () => {
  it('registers bitmap, image, and render texture sources without compressed images', () => {
    const { state } = createGlState();
    registerStandardGlTextureResolvers(state);
    expect(registeredTextureSourceKinds(state)).toEqual([
      BitmapTextureSourceKind,
      ImageTextureSourceKind,
      RenderTargetTextureSourceKind,
    ]);
  });
});

describe('resolveGlTexture', () => {
  it('returns null when the state has no registered source resolver', () => {
    const { state } = createGlState();
    expect(resolveGlTexture(state, textureWithImage(imageResource()))).toBeNull();
  });
});

describe('standardGlTextureResolvers', () => {
  it('carries the three standard source kinds', () => {
    expect(standardGlTextureResolvers.entries.size).toBe(3);
    expect(standardGlTextureResolvers.entries.has(BitmapTextureSourceKind)).toBe(true);
    expect(standardGlTextureResolvers.entries.has(ImageTextureSourceKind)).toBe(true);
    expect(standardGlTextureResolvers.entries.has(RenderTargetTextureSourceKind)).toBe(true);
  });

  it('does not include the compressed-image resolver', () => {
    expect(standardGlTextureResolvers.entries.has(CompressedImageTextureSourceKind)).toBe(false);
  });
});
