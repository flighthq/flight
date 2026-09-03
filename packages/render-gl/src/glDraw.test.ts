import { createEntity } from '@flighthq/entity/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type { Bitmap, CompressedImageResource, ImageResource, SamplerLike, Texture } from '@flighthq/types/contract';
import {
  AdvancedBlendMode,
  BitmapTextureSourceKind,
  BlendMode,
  CompressedImageTextureSourceKind,
  ImageTextureSourceKind,
} from '@flighthq/types/contract';

import { registerGlCompressedTextureDecoder, registerGlCompressedTextureUpload } from './glCompressedTexture';
import {
  applyGlBlendMode,
  applyGlSamplerState,
  bindGlBitmapTexture,
  bindGlCompressedImageTexture,
  bindGlImageResourceTexture,
  bindGlTexture,
  bindGlTextureRealization,
  bindGlVideoTexture,
  createGlTexture,
  drawGlQuad,
  enableGlBlendModeSupport,
  isBlendModeSupported,
  registerDefaultGlBlendModes,
  registerGlBlendMode,
  setGlQuadMatrixFromOffset,
  standardGlBlendRealizations,
  updateGlTexture,
  useGlProgram,
} from './glDraw';
import { createEmptyGlRegistries, createGlPipeline } from './glPipeline';
import {
  createGlContextState,
  createGlOffscreenRenderState,
  createGlRenderState,
  getGlRenderStateRuntime,
  invalidateGlRenderStateCache,
} from './glRenderState';
import { registerGlBitmapShader } from './glShaderRegistry';
import { createGlState, makeGL } from './glTestHelper';

const testPipeline = createGlPipeline(createEmptyGlRegistries());

function createTestGlRenderState(gl: WebGL2RenderingContext) {
  return createGlRenderState(createGlContextState(gl), testPipeline);
}

// A single 4×4 bc3 level for exercising the opt-in compressed upload seam.
function compressedBc3Image(): CompressedImageResource {
  return {
    compressed: {
      container: {
        format: 'bc3',
        width: 4,
        height: 4,
        depth: 1,
        mipLevels: 1,
        layers: 1,
        faces: 1,
        supercompression: 'None',
        levels: [{ byteOffset: 0, byteLength: 16, width: 4, height: 4 }],
      },
      payload: new Uint8Array(16),
    },
    width: 4,
    height: 4,
    version: 1,
    kind: CompressedImageTextureSourceKind,
  } as unknown as CompressedImageResource;
}

function bitmap(size: number, version: number): Bitmap {
  return {
    alphaType: 'straight',
    gamut: 'srgb',
    data: new Uint8ClampedArray(size * size * 4),
    format: 'rgba8unorm',
    height: size,
    kind: BitmapTextureSourceKind,
    version,
    width: size,
  } as unknown as Bitmap;
}

// A plain SamplerLike with the AAA sampling defaults (clamp/linear/trilinear/mips, anisotropy off),
// mirroring createSampler in @flighthq/texture without pulling that package into render-gl's tests.
function makeSampler(overrides?: Partial<SamplerLike>): SamplerLike {
  return {
    anisotropy: 1,
    magFilter: 'linear',
    minFilter: 'linear-mipmap-linear',
    mipmaps: true,
    wrapU: 'clamp-to-edge',
    wrapV: 'clamp-to-edge',
    ...overrides,
  };
}

describe('applyGlBlendMode', () => {
  it('applies a different realization for the same mode on a derived state', () => {
    const gl = makeGL();
    const screen = createTestGlRenderState(gl);
    registerGlBlendMode(screen, 'acme.Split', { dst: 'ONE', equation: 'MIN', src: 'ONE' });
    const offscreen = createGlOffscreenRenderState(
      screen.contextState,
      createGlPipeline(getGlRenderStateRuntime(screen).registries),
    );
    registerGlBlendMode(screen, 'acme.Split', { dst: 'ONE', src: 'ZERO' });

    applyGlBlendMode(offscreen, 'acme.Split');
    expect(gl.blendEquation).toHaveBeenLastCalledWith(gl.MIN);
    expect(gl.blendFunc).toHaveBeenLastCalledWith(gl.ONE, gl.ONE);
    vi.mocked(gl.blendEquation).mockClear();
    vi.mocked(gl.blendFunc).mockClear();
    applyGlBlendMode(screen, 'acme.Split');

    expect(gl.blendEquation).toHaveBeenCalledWith(gl.FUNC_ADD);
    expect(gl.blendFunc).toHaveBeenCalledWith(gl.ZERO, gl.ONE);
  });

  it('applies normal blending after the binding cache is invalidated', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Add);
    invalidateGlRenderStateCache(state);
    vi.mocked(gl.blendEquation).mockClear();
    vi.mocked(gl.blendFunc).mockClear();

    applyGlBlendMode(state, null);

    expect(gl.blendEquation).toHaveBeenCalledWith(gl.FUNC_ADD);
    expect(gl.blendFunc).toHaveBeenCalledWith(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  });

  it('does not call blendFunc when blend mode has not changed', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    getGlRenderStateRuntime(state).context.currentBlendSignature = {
      dst: gl.ONE_MINUS_SRC_ALPHA,
      equation: gl.FUNC_ADD,
      src: gl.ONE,
    };
    applyGlBlendMode(state, BlendMode.Normal);
    expect(gl.blendFunc).not.toHaveBeenCalled();
  });

  it('sets normal blend (ONE, ONE_MINUS_SRC_ALPHA) for BlendMode.Normal', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Normal);
    const g = gl as unknown as { ONE: number; ONE_MINUS_SRC_ALPHA: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE_MINUS_SRC_ALPHA);
  });

  it('sets additive blend (ONE, ONE) for BlendMode.Add', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Add);
    const g = gl as unknown as { ONE: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE);
  });

  it('sets (DST_COLOR, ONE_MINUS_SRC_ALPHA) for BlendMode.Multiply', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Multiply);
    const g = gl as unknown as { DST_COLOR: number; ONE_MINUS_SRC_ALPHA: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.DST_COLOR, g.ONE_MINUS_SRC_ALPHA);
  });

  it('sets (ONE, ONE_MINUS_SRC_COLOR) for BlendMode.Screen', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Screen);
    const g = gl as unknown as { ONE: number; ONE_MINUS_SRC_COLOR: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE_MINUS_SRC_COLOR);
  });

  it('sets the MIN blend equation with (ONE, ONE) for BlendMode.Darken', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Darken);
    const g = gl as unknown as { ONE: number; MIN: number };
    expect(gl.blendEquation).toHaveBeenCalledWith(g.MIN);
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE);
  });

  it('sets the MAX blend equation with (ONE, ONE) for BlendMode.Lighten', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Lighten);
    const g = gl as unknown as { ONE: number; MAX: number };
    expect(gl.blendEquation).toHaveBeenCalledWith(g.MAX);
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE);
  });

  it('resets the blend equation to FUNC_ADD for a mode that does not carry one', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Darken);
    applyGlBlendMode(state, BlendMode.Normal);
    const g = gl as unknown as { FUNC_ADD: number };
    expect(gl.blendEquation).toHaveBeenLastCalledWith(g.FUNC_ADD);
  });

  it('falls back to normal blend for a mode with no registered realization', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, AdvancedBlendMode.Overlay);
    const g = gl as unknown as { ONE: number; ONE_MINUS_SRC_ALPHA: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE_MINUS_SRC_ALPHA);
  });

  it('falls back to normal blend when no modes are registered at all', () => {
    const { state, gl } = createGlState();
    applyGlBlendMode(state, BlendMode.Multiply);
    const g = gl as unknown as { ONE: number; ONE_MINUS_SRC_ALPHA: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE_MINUS_SRC_ALPHA);
  });

  it('updates the realized blend signature after the change', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Add);
    expect(getGlRenderStateRuntime(state).context.currentBlendSignature).toEqual({
      dst: gl.ONE,
      equation: gl.FUNC_ADD,
      src: gl.ONE,
    });
  });

  it('calls blendFunc again when mode switches', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Normal);
    applyGlBlendMode(state, BlendMode.Add);
    expect(gl.blendFunc).toHaveBeenCalledTimes(2);
  });
});

describe('applyGlSamplerState', () => {
  it('applies sampler state to an existing texture without uploading it', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const texture = gl.createTexture()!;
    const uploads = vi.mocked(gl.texImage2D).mock.calls.length;

    applyGlSamplerState(state, runtime, texture, makeSampler({ mipmaps: false, wrapU: 'repeat' }));

    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    expect(gl.texImage2D).toHaveBeenCalledTimes(uploads);
  });
});

describe('bindGlBitmapTexture', () => {
  it('uploads CPU-readable pixels via the raw-pixel path', () => {
    const { state, gl } = createGlState();
    bindGlBitmapTexture(state, bitmap(4, 1));
    expect(gl.createTexture).toHaveBeenCalled();
    expect(gl.texImage2D).toHaveBeenCalled();
  });

  it('caches by resource identity and re-uploads only when the version changes', () => {
    const { state, gl } = createGlState();
    const image = bitmap(1, 1);
    const t1 = bindGlBitmapTexture(state, image);
    const uploads = (gl.texImage2D as ReturnType<typeof vi.fn>).mock.calls.length;
    const t2 = bindGlBitmapTexture(state, image);
    expect(t2).toBe(t1);
    expect((gl.texImage2D as ReturnType<typeof vi.fn>).mock.calls.length).toBe(uploads);
    image.version = 2;
    bindGlBitmapTexture(state, image);
    expect((gl.texImage2D as ReturnType<typeof vi.fn>).mock.calls.length).toBe(uploads + 1);
  });

  it('a smoothingOverride=false forces NEAREST even when allowSmoothing is true', () => {
    const { state, gl } = createGlState({ allowSmoothing: true });
    bindGlBitmapTexture(state, bitmap(4, 1), null, false);
    const g = gl as unknown as {
      TEXTURE_2D: number;
      TEXTURE_MIN_FILTER: number;
      TEXTURE_MAG_FILTER: number;
      NEAREST: number;
    };
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
  });

  it('a smoothingOverride=true forces LINEAR even when allowSmoothing is false', () => {
    const { state, gl } = createGlState({ allowSmoothing: false });
    bindGlBitmapTexture(state, bitmap(4, 1), null, true);
    const g = gl as unknown as {
      TEXTURE_2D: number;
      TEXTURE_MIN_FILTER: number;
      TEXTURE_MAG_FILTER: number;
      LINEAR: number;
    };
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
  });
});

// A 1x1 bitmap with an explicit encoding and texel, for the alpha-encoding round trip below.
function encodedBitmap(alphaType: 'straight' | 'premultiplied', rgba: readonly number[]): Bitmap {
  return {
    alphaType,
    data: new Uint8ClampedArray(rgba),
    format: 'rgba8unorm',
    gamut: 'srgb',
    height: 1,
    kind: BitmapTextureSourceKind,
    version: 1,
    width: 1,
  } as unknown as Bitmap;
}

// The uploader resolves the source's DECLARED encoding to the one the caller asked for, in BOTH
// directions. The straight direction is what makes a premultiplied source safe as a 3D material map: 3D
// binds with premultiply=false and premultiplies in its fragment tail, so passing premultiplied rgb
// straight through would square the coverage and darken every translucent texel.
describe('bindGlBitmapTexture alpha encoding', () => {
  const uploadedPixels = (gl: { texImage2D: unknown }): Uint8ClampedArray =>
    (gl.texImage2D as ReturnType<typeof vi.fn>).mock.calls.at(-1)!.at(-1) as Uint8ClampedArray;

  it('recovers straight rgb when a premultiplied source is bound for a straight realization', () => {
    const { state, gl } = createGlState();
    bindGlBitmapTexture(state, encodedBitmap('premultiplied', [64, 32, 16, 128]), undefined, null, false);
    const pixels = uploadedPixels(gl);
    // 64 stored at a=128 recovers to ~128 straight (64 * 255/128); alpha itself is untouched.
    expect(pixels[0]).toBeGreaterThan(120);
    expect(pixels[3]).toBe(128);
  });

  it('leaves a premultiplied source untouched for a premultiplied realization', () => {
    const { state, gl } = createGlState();
    bindGlBitmapTexture(state, encodedBitmap('premultiplied', [64, 32, 16, 128]), undefined, null, true);
    expect(Array.from(uploadedPixels(gl).slice(0, 4))).toEqual([64, 32, 16, 128]);
  });

  it('leaves a fully transparent premultiplied texel at zero rather than dividing by zero', () => {
    const { state, gl } = createGlState();
    bindGlBitmapTexture(state, encodedBitmap('premultiplied', [0, 0, 0, 0]), undefined, null, false);
    expect(Array.from(uploadedPixels(gl).slice(0, 4))).toEqual([0, 0, 0, 0]);
  });
});

describe('bindGlCompressedImageTexture', () => {
  it('routes through the registered compressed upload seam (decode fallback)', () => {
    // The device mock exposes no block extension, so the compressed container falls back to the
    // registered RGBA decoder and uploads via texImage2D — proving the real bind/draw path reaches the
    // installed compressed uploader.
    const { state, gl } = createGlState();
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    const decode = vi.fn(() => rgba);
    registerGlCompressedTextureUpload(state);
    registerGlCompressedTextureDecoder(state, decode);
    const image = compressedBc3Image();
    bindGlCompressedImageTexture(state, image);
    expect(decode).toHaveBeenCalledWith('bc3', 4, 4, expect.any(Uint8Array));
    expect(gl.texImage2D).toHaveBeenCalled();
    expect(getGlRenderStateRuntime(state).context.currentTextureRealization?.straightAlpha).toBe(true);
  });

  it('preserves straight-alpha sampling on a cache hit', () => {
    const { state } = createGlState();
    registerGlCompressedTextureUpload(state);
    registerGlCompressedTextureDecoder(
      state,
      vi.fn(() => new Uint8ClampedArray(4 * 4 * 4)),
    );
    const image = compressedBc3Image();
    bindGlCompressedImageTexture(state, image);
    getGlRenderStateRuntime(state).context.currentTextureRealization = null;
    bindGlCompressedImageTexture(state, image);
    expect(getGlRenderStateRuntime(state).context.currentTextureRealization?.straightAlpha).toBe(true);
  });

  it('skips the image when no compressed uploader is registered', () => {
    // The compressed path is an opt-in seam: without registerGlCompressedTextureUpload, a compressed
    // image uploads nothing (the enum table tree-shakes out of a bitmap-only bundle) rather than
    // reaching texImage2D.
    const { state, gl } = createGlState();
    bindGlCompressedImageTexture(state, compressedBc3Image());
    expect(gl.texImage2D).not.toHaveBeenCalled();
    expect(gl.compressedTexImage2D).not.toHaveBeenCalled();
  });
});

describe('bindGlImageResourceTexture', () => {
  it('uploads a host-backed image via the element path', () => {
    const { state, gl } = createGlState();
    const image = {
      source: document.createElement('img'),
      width: 1,
      height: 1,
      kind: ImageTextureSourceKind,
      version: 1,
    } as unknown as ImageResource;
    bindGlImageResourceTexture(state, image);
    expect(gl.texImage2D).toHaveBeenCalled();
  });
});

describe('bindGlTexture', () => {
  it('creates a new texture for an uncached image source', () => {
    const { state, gl } = createGlState();
    const img = document.createElement('img');
    bindGlTexture(state, img);
    expect(gl.createTexture).toHaveBeenCalled();
  });

  it('uploads texture data on first bind', () => {
    const { state, gl } = createGlState();
    const img = document.createElement('img');
    bindGlTexture(state, img);
    expect(gl.texImage2D).toHaveBeenCalled();
  });

  it('returns the same texture object on subsequent calls with the same source', () => {
    const { state } = createGlState();
    const img = document.createElement('img');
    const t1 = bindGlTexture(state, img);
    const t2 = bindGlTexture(state, img);
    expect(t1).toBe(t2);
  });

  it('does not call texImage2D again for a cached texture', () => {
    const { state, gl } = createGlState();
    const img = document.createElement('img');
    bindGlTexture(state, img);
    const uploadCount = (gl.texImage2D as ReturnType<typeof vi.fn>).mock.calls.length;
    bindGlTexture(state, img);
    expect((gl.texImage2D as ReturnType<typeof vi.fn>).mock.calls.length).toBe(uploadCount);
  });

  it('premultiplies alpha on upload for HTMLCanvasElement sources', () => {
    // Canvas pixels reach texImage2D as straight alpha; premultiplying on upload keeps canvas-backed
    // shapes/text consistent with the premultiplied (ONE, ONE_MINUS_SRC_ALPHA) blend. Without this a
    // semi-transparent shape blows out to full opacity.
    const { state, gl } = createGlState();
    const canvas = document.createElement('canvas');
    bindGlTexture(state, canvas);
    expect(gl.pixelStorei).toHaveBeenCalledWith(
      (gl as unknown as { UNPACK_PREMULTIPLY_ALPHA_WEBGL: number }).UNPACK_PREMULTIPLY_ALPHA_WEBGL,
      true,
    );
  });

  it('sets premultiply to true for non-canvas image sources', () => {
    const { state, gl } = createGlState();
    const img = document.createElement('img');
    bindGlTexture(state, img);
    expect(gl.pixelStorei).toHaveBeenCalledWith(
      (gl as unknown as { UNPACK_PREMULTIPLY_ALPHA_WEBGL: number }).UNPACK_PREMULTIPLY_ALPHA_WEBGL,
      true,
    );
  });

  it('rebinds and updates currentTexture when switching to a cached texture', () => {
    const { state, gl } = createGlState();
    const img = document.createElement('img');
    const texture = bindGlTexture(state, img);
    const runtime = getGlRenderStateRuntime(state);
    runtime.context.currentTextureRealization = null;
    bindGlTexture(state, img);
    expect(gl.bindTexture).toHaveBeenCalledWith((gl as unknown as { TEXTURE_2D: number }).TEXTURE_2D, texture);
    expect(getGlRenderStateRuntime(state).context.currentTextureRealization?.texture).toBe(texture);
  });

  it('rebinds a cached texture even when it is already current, for multi-unit correctness', () => {
    // The same image reused as two maps (e.g. normal + metallic-roughness) is bound to two active
    // units in a row; currentTexture is unit-blind, so a skip would leave the second unit unbound.
    const { state, gl } = createGlState();
    const img = document.createElement('img');
    const texture = bindGlTexture(state, img);
    const g = gl as unknown as { TEXTURE_2D: number };
    const bindsBefore = (gl.bindTexture as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[1] === texture).length;
    // currentTexture === texture here; the second bind (a different active unit in practice) must not skip.
    bindGlTexture(state, img);
    const bindsAfter = (gl.bindTexture as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[1] === texture).length;
    expect(bindsAfter).toBe(bindsBefore + 1);
    expect(gl.bindTexture).toHaveBeenLastCalledWith(g.TEXTURE_2D, texture);
  });

  it('defaults both wrap modes to clamp-to-edge', () => {
    const { state, gl } = createGlState();
    bindGlTexture(state, document.createElement('img'));
    const g = gl as unknown as {
      TEXTURE_2D: number;
      TEXTURE_WRAP_S: number;
      TEXTURE_WRAP_T: number;
      CLAMP_TO_EDGE: number;
    };
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  });

  it('applies the sampler wrap mode — repeat → REPEAT — so tiled uvs actually repeat', () => {
    const { state, gl } = createGlState();
    bindGlTexture(state, document.createElement('img'), makeSampler({ wrapU: 'repeat', wrapV: 'repeat' }));
    const g = gl as unknown as { TEXTURE_2D: number; TEXTURE_WRAP_S: number; TEXTURE_WRAP_T: number; REPEAT: number };
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT);
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.REPEAT);
  });

  it('maps mirror-repeat to MIRRORED_REPEAT', () => {
    const { state, gl } = createGlState();
    bindGlTexture(
      state,
      document.createElement('img'),
      makeSampler({ wrapU: 'mirror-repeat', wrapV: 'mirror-repeat' }),
    );
    const g = gl as unknown as {
      TEXTURE_2D: number;
      TEXTURE_WRAP_S: number;
      TEXTURE_WRAP_T: number;
      MIRRORED_REPEAT: number;
    };
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.MIRRORED_REPEAT);
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.MIRRORED_REPEAT);
  });

  it('re-applies wrap on a cache hit so a shared image follows the current draw sampler', () => {
    // The torus in basic-shading reuses one jpg as both normal and metallic-roughness; if wrap were
    // baked only at upload, the second material would inherit the first's wrap. Re-applying per bind
    // means a repeat draw then a clamp draw each set their own wrap on the shared cached texture.
    const { state, gl } = createGlState();
    const img = document.createElement('img');
    bindGlTexture(state, img, makeSampler({ wrapU: 'repeat', wrapV: 'repeat' }));
    bindGlTexture(state, img, makeSampler({ wrapU: 'clamp-to-edge', wrapV: 'clamp-to-edge' }));
    const g = gl as unknown as {
      TEXTURE_2D: number;
      TEXTURE_WRAP_S: number;
      REPEAT: number;
      CLAMP_TO_EDGE: number;
    };
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT);
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
  });

  it('falls back to the allowSmoothing LINEAR filter and clamp-to-edge when no sampler is given', () => {
    // The 2D bitmap/sprite path passes no sampler and must keep its historical bilinear, no-mip,
    // clamp default — a material sampler never leaks into it.
    const { state, gl } = createGlState({ allowSmoothing: true });
    bindGlTexture(state, document.createElement('img'));
    const g = gl as unknown as {
      TEXTURE_2D: number;
      TEXTURE_MIN_FILTER: number;
      TEXTURE_MAG_FILTER: number;
      TEXTURE_WRAP_S: number;
      LINEAR: number;
      CLAMP_TO_EDGE: number;
    };
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    expect(gl.generateMipmap).not.toHaveBeenCalled();
  });

  it('applies the sampler min/mag filter and generates a mip chain for a trilinear sampler', () => {
    const { state, gl } = createGlState({ allowSmoothing: false });
    bindGlTexture(state, document.createElement('img'), makeSampler());
    const g = gl as unknown as {
      TEXTURE_2D: number;
      TEXTURE_MIN_FILTER: number;
      TEXTURE_MAG_FILTER: number;
      LINEAR: number;
      LINEAR_MIPMAP_LINEAR: number;
    };
    // Sampler filters win over the state's allowSmoothing flag for material textures.
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR);
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    expect(gl.generateMipmap).toHaveBeenCalledWith(g.TEXTURE_2D);
  });

  it('collapses a mip-named min filter to LINEAR and skips mip generation when mipmaps is false', () => {
    // minFilter names a mip level but mipmaps is off: selecting an absent chain would render black, so
    // the filter must fall back to the base level and generateMipmap must not run.
    const { state, gl } = createGlState();
    bindGlTexture(state, document.createElement('img'), makeSampler({ mipmaps: false }));
    const g = gl as unknown as { TEXTURE_2D: number; TEXTURE_MIN_FILTER: number; LINEAR: number };
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    expect(gl.generateMipmap).not.toHaveBeenCalled();
  });

  it('generates the mip chain only once for a texture bound repeatedly', () => {
    const { state, gl } = createGlState();
    const img = document.createElement('img');
    bindGlTexture(state, img, makeSampler());
    bindGlTexture(state, img, makeSampler());
    expect((gl.generateMipmap as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('applies clamped anisotropy through EXT_texture_filter_anisotropic when supported', () => {
    const { state, gl } = createGlState();
    const ext = { TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff };
    (gl.getExtension as ReturnType<typeof vi.fn>).mockImplementation((name: string) =>
      name === 'EXT_texture_filter_anisotropic' ? ext : null,
    );
    (gl.getParameter as ReturnType<typeof vi.fn>).mockImplementation((p: number) =>
      p === ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT ? 8 : undefined,
    );
    bindGlTexture(state, document.createElement('img'), makeSampler({ anisotropy: 16 }));
    const g = gl as unknown as { TEXTURE_2D: number };
    // Requested 16 clamps to the hardware max of 8.
    expect(gl.texParameterf).toHaveBeenCalledWith(g.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 8);
  });

  it('skips anisotropy setup when the extension is unavailable', () => {
    const { state, gl } = createGlState();
    (gl.getExtension as ReturnType<typeof vi.fn>).mockImplementation(() => null);
    bindGlTexture(state, document.createElement('img'), makeSampler({ anisotropy: 16 }));
    expect(gl.texParameterf).not.toHaveBeenCalled();
  });
});

describe('bindGlTextureRealization', () => {
  it('binds and publishes the texture handle with its alpha interpretation as one record', () => {
    const { state, gl } = createGlState();
    const texture = gl.createTexture()!;

    expect(bindGlTextureRealization(state, { straightAlpha: true, texture })).toBe(texture);

    expect(gl.bindTexture).toHaveBeenLastCalledWith(gl.TEXTURE_2D, texture);
    expect(getGlRenderStateRuntime(state).context.currentTextureRealization).toEqual({ straightAlpha: true, texture });
  });

  it('unbinds and invalidates the texture realization together', () => {
    const { state, gl } = createGlState();
    bindGlTextureRealization(state, { straightAlpha: true, texture: gl.createTexture()! });

    expect(bindGlTextureRealization(state, null)).toBeNull();

    expect(gl.bindTexture).toHaveBeenLastCalledWith(gl.TEXTURE_2D, null);
    expect(getGlRenderStateRuntime(state).context.currentTextureRealization).toBeNull();
  });
});

describe('bindGlVideoTexture', () => {
  function videoTexture(version: number, readyState = 4, videoWidth = 320, videoHeight = 240): Texture {
    return {
      sampler: makeSampler(),
      dimension: '2d',
      source: {
        source: { readyState, videoWidth, videoHeight } as unknown as HTMLVideoElement,
        version,
      },
      version,
    } as unknown as Texture;
  }

  it('creates a texture, uploads the current frame, and caches by source identity', () => {
    const { state, gl } = createGlState();
    const vt = videoTexture(3);
    const t1 = bindGlVideoTexture(state, vt);
    expect(gl.createTexture).toHaveBeenCalled();
    expect(gl.texImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      (getTextureSource(vt) as ImageResource).source,
    );
    const t2 = bindGlVideoTexture(state, vt);
    expect(t2).toBe(t1);
  });

  it('re-uploads only when the source version advances (the dirty-gate)', () => {
    const { state, gl } = createGlState();
    const vt = videoTexture(1);
    bindGlVideoTexture(state, vt);
    const uploads = (gl.texImage2D as ReturnType<typeof vi.fn>).mock.calls.length;
    bindGlVideoTexture(state, vt);
    expect((gl.texImage2D as ReturnType<typeof vi.fn>).mock.calls.length).toBe(uploads);
    getTextureSource(vt)!.version = 2;
    bindGlVideoTexture(state, vt);
    expect((gl.texImage2D as ReturnType<typeof vi.fn>).mock.calls.length).toBe(uploads + 1);
  });

  it('realizes distinct linear and sRGB textures for one video source', () => {
    const { state, gl } = createGlState();
    const vt = videoTexture(1);
    vt.colorSpace = 'srgb';
    const srgb = bindGlVideoTexture(state, vt);
    expect(gl.texImage2D).toHaveBeenLastCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.SRGB8_ALPHA8,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      (getTextureSource(vt) as ImageResource).source,
    );
    vt.colorSpace = 'linear';
    const linear = bindGlVideoTexture(state, vt);
    expect(linear).not.toBe(srgb);
    expect(gl.texImage2D).toHaveBeenLastCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      (getTextureSource(vt) as ImageResource).source,
    );
  });

  it('does not upload when the element has no decoded frame yet', () => {
    const { state, gl } = createGlState();
    bindGlVideoTexture(state, videoTexture(1, 1, 0, 0));
    expect(gl.texImage2D).not.toHaveBeenCalled();
  });

  it('applies the Texture sampler when no explicit sampler is passed', () => {
    const { state, gl } = createGlState();
    const vt = videoTexture(1);
    (vt as { sampler: SamplerLike }).sampler = makeSampler({ wrapU: 'repeat' });
    bindGlVideoTexture(state, vt);
    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  });
});

describe('createGlTexture', () => {
  it('creates and returns a WebGLTexture', () => {
    const { state } = createGlState();
    const texture = createGlTexture(state);
    expect(texture).toBeDefined();
  });

  it('binds the new texture', () => {
    const { state, gl } = createGlState();
    const texture = createGlTexture(state);
    expect(gl.bindTexture).toHaveBeenCalledWith((gl as unknown as { TEXTURE_2D: number }).TEXTURE_2D, texture);
  });

  it('sets CLAMP_TO_EDGE for both wrap modes', () => {
    const { state, gl } = createGlState();
    createGlTexture(state);
    const g = gl as unknown as {
      TEXTURE_2D: number;
      TEXTURE_WRAP_S: number;
      TEXTURE_WRAP_T: number;
      CLAMP_TO_EDGE: number;
    };
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  });

  it('uses LINEAR filter when allowSmoothing is true', () => {
    const { state, gl } = createGlState({ allowSmoothing: true });
    createGlTexture(state);
    const g = gl as unknown as {
      TEXTURE_2D: number;
      TEXTURE_MIN_FILTER: number;
      TEXTURE_MAG_FILTER: number;
      LINEAR: number;
    };
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
  });

  it('uses NEAREST filter when allowSmoothing is false', () => {
    const { state, gl } = createGlState({ allowSmoothing: false });
    createGlTexture(state);
    const g = gl as unknown as {
      TEXTURE_2D: number;
      TEXTURE_MIN_FILTER: number;
      TEXTURE_MAG_FILTER: number;
      NEAREST: number;
    };
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
  });

  it('stores the new texture as currentTexture on state', () => {
    const { state } = createGlState();
    const texture = createGlTexture(state);
    expect(getGlRenderStateRuntime(state).context.currentTextureRealization?.texture).toBe(texture);
  });
});

describe('drawGlQuad', () => {
  it('writes vertex positions and UVs into quadVertexData', () => {
    const { state } = createGlState();
    drawGlQuad(state, 0, 0, 100, 50, 0, 0, 1, 1);
    const v = getGlRenderStateRuntime(state).quadVertexData;
    // Bottom-left
    expect(v[0]).toBe(0);
    expect(v[1]).toBe(0);
    expect(v[2]).toBe(0);
    expect(v[3]).toBe(0);
    // Bottom-right
    expect(v[4]).toBe(100);
    expect(v[5]).toBe(0);
    expect(v[6]).toBe(1);
    expect(v[7]).toBe(0);
    // Top-right
    expect(v[8]).toBe(100);
    expect(v[9]).toBe(50);
    expect(v[10]).toBe(1);
    expect(v[11]).toBe(1);
    // Top-left
    expect(v[12]).toBe(0);
    expect(v[13]).toBe(50);
    expect(v[14]).toBe(0);
    expect(v[15]).toBe(1);
  });

  it('calls bufferSubData to upload vertex data', () => {
    const { state, gl } = createGlState();
    drawGlQuad(state, 10, 20, 110, 70, 0.1, 0.2, 0.9, 0.8);
    expect(gl.bufferSubData).toHaveBeenCalledWith(
      (gl as unknown as { ARRAY_BUFFER: number }).ARRAY_BUFFER,
      0,
      getGlRenderStateRuntime(state).quadVertexData,
    );
  });

  it('calls drawElements for 6 indices forming 2 triangles', () => {
    const { state, gl } = createGlState();
    drawGlQuad(state, 0, 0, 100, 50, 0, 0, 1, 1);
    const g = gl as unknown as { TRIANGLES: number; UNSIGNED_SHORT: number };
    expect(gl.drawElements).toHaveBeenCalledWith(g.TRIANGLES, 6, g.UNSIGNED_SHORT, 0);
  });
});

describe('enableGlBlendModeSupport', () => {
  it('wires applyBlendMode onto the state', () => {
    const { state } = createGlState();
    expect(state.applyBlendMode).toBeNull();
    enableGlBlendModeSupport(state);
    expect(state.applyBlendMode).not.toBeNull();
  });

  it('causes blend modes to be applied via gl.blendFunc', () => {
    const { state, gl } = createGlState();
    enableGlBlendModeSupport(state);
    state.applyBlendMode!(state, BlendMode.Add);
    expect(gl.blendFunc).toHaveBeenCalled();
  });

  it('registers the default blend modes', () => {
    const { state } = createGlState();
    enableGlBlendModeSupport(state);
    expect(isBlendModeSupported(state, BlendMode.Multiply)).toBe(true);
  });
});

describe('isBlendModeSupported', () => {
  it('returns false when no modes are registered', () => {
    const { state } = createGlState();
    expect(isBlendModeSupported(state, BlendMode.Normal)).toBe(false);
  });

  it('returns true for a registered built-in mode', () => {
    const { state } = createGlState();
    registerDefaultGlBlendModes(state);
    expect(isBlendModeSupported(state, BlendMode.Screen)).toBe(true);
  });

  it('returns false for an advanced mode with no fixed-function realization', () => {
    const { state } = createGlState();
    registerDefaultGlBlendModes(state);
    expect(isBlendModeSupported(state, AdvancedBlendMode.Overlay)).toBe(false);
  });

  it('returns true for a custom registered mode', () => {
    const { state } = createGlState();
    registerGlBlendMode(state, 'acme.Foo', { src: 'ONE', dst: 'ZERO' });
    expect(isBlendModeSupported(state, 'acme.Foo')).toBe(true);
  });
});

describe('registerDefaultGlBlendModes', () => {
  it('registers the tier-1 fixed-function modes', () => {
    const { state } = createGlState();
    registerDefaultGlBlendModes(state);
    for (const mode of [
      BlendMode.Normal,
      BlendMode.Add,
      BlendMode.Multiply,
      BlendMode.Screen,
      BlendMode.Darken,
      BlendMode.Lighten,
    ]) {
      expect(isBlendModeSupported(state, mode)).toBe(true);
    }
  });

  it('does not register the shader-composited or unary modes', () => {
    const { state } = createGlState();
    registerDefaultGlBlendModes(state);
    for (const mode of [AdvancedBlendMode.Overlay, AdvancedBlendMode.HardLight, AdvancedBlendMode.Difference]) {
      expect(isBlendModeSupported(state, mode)).toBe(false);
    }
  });
});

describe('registerGlBlendMode', () => {
  it('makes a custom mode applied through gl.blendFunc', () => {
    const { state, gl } = createGlState();
    registerGlBlendMode(state, 'acme.Foo', { src: 'DST_COLOR', dst: 'ZERO' });
    applyGlBlendMode(state, 'acme.Foo');
    const g = gl as unknown as { DST_COLOR: number; ZERO: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.DST_COLOR, g.ZERO);
  });

  it('overrides a built-in mode last-write-wins', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    registerGlBlendMode(state, BlendMode.Add, { src: 'ZERO', dst: 'ONE' });
    applyGlBlendMode(state, BlendMode.Add);
    const g = gl as unknown as { ONE: number; ZERO: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ZERO, g.ONE);
  });

  it("replaces the table without changing an offscreen state's retained snapshot", () => {
    const { state: screen } = createGlState();
    const initial = { src: 'DST_COLOR', dst: 'ZERO' } as const;
    const replacement = { src: 'ZERO', dst: 'ONE' } as const;
    registerGlBlendMode(screen, 'acme.Foo', initial);
    const snapshot = getGlRenderStateRuntime(screen).registries.blendRealizations;
    const offscreen = createGlOffscreenRenderState(
      screen.contextState,
      createGlPipeline(getGlRenderStateRuntime(screen).registries),
    );

    registerGlBlendMode(screen, 'acme.Foo', replacement);

    expect(getGlRenderStateRuntime(screen).registries.blendRealizations).not.toBe(snapshot);
    expect(getGlRenderStateRuntime(offscreen).registries.blendRealizations).toBe(snapshot);
    expect(getRegistryTableEntry(snapshot, 'acme.Foo')).toBe(initial);
    expect(getRegistryTableEntry(getGlRenderStateRuntime(screen).registries.blendRealizations, 'acme.Foo')).toBe(
      replacement,
    );
  });
});

describe('setGlQuadMatrixFromOffset', () => {
  it('bakes the offset into the translation before setting the matrix', () => {
    const { state, gl } = createGlState();
    // Identity transform + offset (dx=10, dy=20): effective tx = 0 + 1*10 + 0*20 = 10
    const runtime = getGlRenderStateRuntime(state);
    setGlQuadMatrixFromOffset(state, 1, 0, 0, 1, 0, 0, 10, 20);
    expect(gl.uniformMatrix3fv).toHaveBeenCalledWith(
      runtime.context.currentShader!.locations!.locMatrix,
      false,
      runtime.matrixArray,
    );
    // tx * 2/200 - 1 = 10 * 0.01 - 1 = -0.9
    expect(runtime.matrixArray[6]).toBeCloseTo(-0.9);
    // -ty * 2/100 + 1 = -20 * 0.02 + 1 = 0.6
    expect(runtime.matrixArray[7]).toBeCloseTo(0.6);
  });

  it('applies the offset through the transform matrix components', () => {
    const { state } = createGlState();
    // Scale-2 transform with offset (dx=5, dy=0): effective tx = 0 + 2*5 + 0*0 = 10
    setGlQuadMatrixFromOffset(state, 2, 0, 0, 2, 0, 0, 5, 0);
    // tx * 2/200 - 1 = 10 * 0.01 - 1 = -0.9
    expect(getGlRenderStateRuntime(state).matrixArray[6]).toBeCloseTo(-0.9);
  });
});

describe('standardGlBlendRealizations', () => {
  it('carries the six default fixed-function blend modes', () => {
    expect(standardGlBlendRealizations.entries.size).toBe(6);
    expect(standardGlBlendRealizations.entries.has(BlendMode.Add)).toBe(true);
    expect(standardGlBlendRealizations.entries.has(BlendMode.Darken)).toBe(true);
    expect(standardGlBlendRealizations.entries.has(BlendMode.Lighten)).toBe(true);
    expect(standardGlBlendRealizations.entries.has(BlendMode.Multiply)).toBe(true);
    expect(standardGlBlendRealizations.entries.has(BlendMode.Normal)).toBe(true);
    expect(standardGlBlendRealizations.entries.has(BlendMode.Screen)).toBe(true);
  });

  it('does not include advanced blend modes that need a shader pass', () => {
    expect(standardGlBlendRealizations.entries.has(AdvancedBlendMode.Overlay)).toBe(false);
    expect(standardGlBlendRealizations.entries.has(AdvancedBlendMode.HardLight)).toBe(false);
  });
});

describe('updateGlTexture', () => {
  it('binds the texture when it is not the current one', () => {
    const { state, gl } = createGlState();
    const texture = {} as WebGLTexture;
    const canvas = document.createElement('canvas');
    getGlRenderStateRuntime(state).context.currentTextureRealization = null;
    updateGlTexture(state, texture, canvas);
    expect(gl.bindTexture).toHaveBeenCalledWith((gl as unknown as { TEXTURE_2D: number }).TEXTURE_2D, texture);
  });

  it('updates currentTexture after binding', () => {
    const { state } = createGlState();
    const texture = {} as WebGLTexture;
    const runtime = getGlRenderStateRuntime(state);
    runtime.context.currentTextureRealization = null;
    updateGlTexture(state, {} as WebGLTexture, document.createElement('canvas'));
    updateGlTexture(state, texture, document.createElement('canvas'));
    // The last call should have updated currentTexture
    expect(getGlRenderStateRuntime(state).context.currentTextureRealization?.texture).toBe(texture);
  });

  it('rebinds even when the texture is already current (currentTexture is unit-blind)', () => {
    const { state, gl } = createGlState();
    const texture = {} as WebGLTexture;
    getGlRenderStateRuntime(state).context.currentTextureRealization = { straightAlpha: false, texture };
    updateGlTexture(state, texture, document.createElement('canvas'));
    // Never skip on currentTexture: the active unit may have changed since it was set, so uploading
    // without rebinding could target the wrong texture.
    expect(gl.bindTexture).toHaveBeenCalledWith((gl as unknown as { TEXTURE_2D: number }).TEXTURE_2D, texture);
  });

  it('always calls texImage2D to upload canvas data', () => {
    const { state, gl } = createGlState();
    const texture = {} as WebGLTexture;
    getGlRenderStateRuntime(state).context.currentTextureRealization = { straightAlpha: false, texture };
    updateGlTexture(state, texture, document.createElement('canvas'));
    expect(gl.texImage2D).toHaveBeenCalled();
  });

  it('sets premultiply alpha before uploading', () => {
    const { state, gl } = createGlState();
    const texture = {} as WebGLTexture;
    getGlRenderStateRuntime(state).context.currentTextureRealization = { straightAlpha: false, texture };
    updateGlTexture(state, texture, document.createElement('canvas'));
    expect(gl.pixelStorei).toHaveBeenCalledWith(
      (gl as unknown as { UNPACK_PREMULTIPLY_ALPHA_WEBGL: number }).UNPACK_PREMULTIPLY_ALPHA_WEBGL,
      true,
    );
  });
});

describe('useGlProgram', () => {
  it('calls useProgram when no program is active', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    runtime.context.currentShader = null;
    useGlProgram(state);
    expect(gl.useProgram).toHaveBeenCalledWith(runtime.defaultBitmapShader!.program);
  });

  it('does not call useProgram when program is already active', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    runtime.context.currentShader = {
      locations: runtime.defaultBitmapShader!.locations,
      program: runtime.defaultBitmapShader!.program,
    };
    useGlProgram(state);
    expect(gl.useProgram).not.toHaveBeenCalled();
  });

  it('stores the program as the current shader after activation', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    runtime.context.currentShader = null;
    useGlProgram(state);
    expect(getGlRenderStateRuntime(state).context.currentShader?.program).toBe(runtime.defaultBitmapShader!.program);
  });

  it('uses the registered bitmap shader program and locations', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const program = {} as WebGLProgram;
    const locations = { ...runtime.defaultBitmapShader!.locations, program };
    const shader = createEntity({
      bind: vi.fn(),
      locations,
      program,
    });

    registerGlBitmapShader(state, shader);
    useGlProgram(state);

    expect(gl.useProgram).toHaveBeenCalledWith(shader.program);
    expect(runtime.context.currentShader?.locations).toBe(shader.locations);
    expect(runtime.context.currentShader?.program).toBe(shader.program);
  });
});
