import type { GlCompressedTextureSupport, ImageResource, TextureContainer } from '@flighthq/types';

import {
  detectGlCompressedTextureSupport,
  getGlCompressedTextureFormat,
  hasGlCompressedTextureFormat,
  registerGlCompressedTextureDecoder,
  registerGlCompressedTextureUpload,
  uploadGlCompressedTextureContainer,
} from './glCompressedTexture';
import { getGlRenderStateRuntime } from './glRenderState';
import { createGlState } from './glTestHelper';

// The subset of extension enum constants the tests exercise (BC3 via s3tc, ASTC 4x4).
const S3TC_EXT = { COMPRESSED_RGBA_S3TC_DXT5_EXT: 0x83f3 };
const ASTC_EXT = { COMPRESSED_RGBA_ASTC_4x4_KHR: 0x93b0 };

// A WebGL2 mock whose getExtension returns only the named extension objects; every other extension
// resolves to null so a format outside the supported set maps to -1.
function makeGl(available: Readonly<Record<string, Record<string, number>>>): WebGL2RenderingContext {
  return {
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE_2D: 0x0de1,
    TEXTURE_2D_ARRAY: 0x8c1a,
    TEXTURE_CUBE_MAP_POSITIVE_X: 0x8515,
    getExtension: vi.fn((name: string) => available[name] ?? null),
    compressedTexImage2D: vi.fn(),
    compressedTexSubImage3D: vi.fn(),
    texStorage3D: vi.fn(),
    texImage2D: vi.fn(),
  } as unknown as WebGL2RenderingContext;
}

function makeContainer(): TextureContainer {
  return {
    format: 'bc3',
    width: 4,
    height: 4,
    depth: 1,
    mipLevels: 1,
    layers: 1,
    faces: 1,
    supercompression: 'None',
    levels: [{ byteOffset: 0, byteLength: 16, width: 4, height: 4 }],
  };
}

// A compressed-only ImageResource wrapping makeContainer, for exercising the installed upload seam.
function uploadableCompressedImage(containerOverrides?: Partial<TextureContainer>): ImageResource {
  return {
    source: null,
    data: null,
    compressed: { container: { ...makeContainer(), ...containerOverrides }, payload: new Uint8Array(16) },
    width: 4,
    height: 4,
    version: 1,
    alphaType: 'straight',
  } as unknown as ImageResource;
}

describe('detectGlCompressedTextureSupport', () => {
  it('reports a family true only when its extension resolves', () => {
    const gl = makeGl({ WEBGL_compressed_texture_astc: ASTC_EXT });
    const support = detectGlCompressedTextureSupport(gl);
    expect(support.astc).toBe(true);
    expect(support.s3tc).toBe(false);
    expect(support.bptc).toBe(false);
  });

  it('requires both s3tc and s3tc_srgb for the s3tc flag', () => {
    const onlyBase = detectGlCompressedTextureSupport(makeGl({ WEBGL_compressed_texture_s3tc: S3TC_EXT }));
    expect(onlyBase.s3tc).toBe(false);
    const both = detectGlCompressedTextureSupport(
      makeGl({ WEBGL_compressed_texture_s3tc: S3TC_EXT, WEBGL_compressed_texture_s3tc_srgb: {} }),
    );
    expect(both.s3tc).toBe(true);
  });
});

describe('getGlCompressedTextureFormat', () => {
  it('resolves the GL enum from the live extension object', () => {
    const gl = makeGl({ WEBGL_compressed_texture_s3tc: S3TC_EXT });
    expect(getGlCompressedTextureFormat(gl, 'bc3')).toBe(0x83f3);
  });

  it('returns -1 when the extension is absent', () => {
    const gl = makeGl({});
    expect(getGlCompressedTextureFormat(gl, 'bc3')).toBe(-1);
  });

  it('returns -1 for uncompressed and Basis-intermediate formats', () => {
    const gl = makeGl({ WEBGL_compressed_texture_s3tc: S3TC_EXT });
    expect(getGlCompressedTextureFormat(gl, 'rgba8unorm')).toBe(-1);
    expect(getGlCompressedTextureFormat(gl, 'etc1s')).toBe(-1);
    expect(getGlCompressedTextureFormat(gl, 'uastc')).toBe(-1);
  });
});

describe('hasGlCompressedTextureFormat', () => {
  const support: GlCompressedTextureSupport = {
    astc: true,
    bptc: false,
    etc: false,
    pvrtc: false,
    rgtc: false,
    s3tc: true,
  };

  it('maps a format to its family flag, including the srgb twin', () => {
    expect(hasGlCompressedTextureFormat(support, 'bc3')).toBe(true);
    expect(hasGlCompressedTextureFormat(support, 'bc3Srgb')).toBe(true);
    expect(hasGlCompressedTextureFormat(support, 'astc8x8')).toBe(true);
    expect(hasGlCompressedTextureFormat(support, 'bc7')).toBe(false);
    expect(hasGlCompressedTextureFormat(support, 'etc2Rgb')).toBe(false);
  });

  it('is false for a non-compressed format', () => {
    expect(hasGlCompressedTextureFormat(support, 'rgba8unorm')).toBe(false);
  });
});

describe('registerGlCompressedTextureDecoder', () => {
  it('installs the decoder on the render-state runtime and clears it with null', () => {
    const { state } = createGlState();
    const decode = vi.fn(() => new Uint8ClampedArray(4));
    registerGlCompressedTextureDecoder(state, decode);
    expect(getGlRenderStateRuntime(state).compressedTextureDecoder).toBe(decode);
    registerGlCompressedTextureDecoder(state, null);
    expect(getGlRenderStateRuntime(state).compressedTextureDecoder).toBeNull();
  });
});

describe('registerGlCompressedTextureUpload', () => {
  it('installs the compressed upload seam on the render-state runtime and clears it with null', () => {
    const { state } = createGlState();
    registerGlCompressedTextureUpload(state);
    expect(getGlRenderStateRuntime(state).compressedTextureUpload).toBeTypeOf('function');
    registerGlCompressedTextureUpload(state, null);
    expect(getGlRenderStateRuntime(state).compressedTextureUpload).toBeNull();
  });

  it('uploads a compressed-only ImageResource once installed, threading the registered decoder', () => {
    const { state, gl } = createGlState();
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    const decode = vi.fn(() => rgba);
    registerGlCompressedTextureUpload(state);
    registerGlCompressedTextureDecoder(state, decode);
    const uploader = getGlRenderStateRuntime(state).compressedTextureUpload!;
    const ok = uploader(gl, uploadableCompressedImage(), decode);
    expect(ok).toBe(true);
    expect(decode).toHaveBeenCalledWith('bc3', 4, 4, expect.any(Uint8Array));
  });

  it('reports false for a resource with no compressed payload', () => {
    const { state, gl } = createGlState();
    registerGlCompressedTextureUpload(state);
    const uploader = getGlRenderStateRuntime(state).compressedTextureUpload!;
    const plain = { source: null, data: null, compressed: null } as unknown as ImageResource;
    expect(uploader(gl, plain, null)).toBe(false);
  });

  it('rejects non-2D containers because the installed image bridge is bound to TEXTURE_2D', () => {
    const { state } = createGlState();
    registerGlCompressedTextureUpload(state);
    const uploader = getGlRenderStateRuntime(state).compressedTextureUpload!;
    const gl = makeGl({ WEBGL_compressed_texture_s3tc: S3TC_EXT });
    expect(uploader(gl, uploadableCompressedImage({ faces: 6 }), null)).toBe(false);
    expect(uploader(gl, uploadableCompressedImage({ layers: 2 }), null)).toBe(false);
    expect(gl.compressedTexImage2D).not.toHaveBeenCalled();
    expect(gl.texStorage3D).not.toHaveBeenCalled();
  });
});

describe('uploadGlCompressedTextureContainer', () => {
  it('drives compressedTexImage2D per level on the native path', () => {
    const gl = makeGl({ WEBGL_compressed_texture_s3tc: S3TC_EXT });
    const payload = new Uint8Array(16);
    const ok = uploadGlCompressedTextureContainer(gl, makeContainer(), payload);
    expect(ok).toBe(true);
    expect(gl.compressedTexImage2D).toHaveBeenCalledTimes(1);
    expect(gl.compressedTexImage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 0, 0x83f3, 4, 4, 0, expect.any(Uint8Array));
    expect(gl.texImage2D).not.toHaveBeenCalled();
  });

  it('decodes to RGBA and uploads via texImage2D when native support is missing', () => {
    const gl = makeGl({});
    const payload = new Uint8Array(16);
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    const decode = vi.fn(() => rgba);
    const ok = uploadGlCompressedTextureContainer(gl, makeContainer(), payload, decode);
    expect(ok).toBe(true);
    expect(decode).toHaveBeenCalledWith('bc3', 4, 4, expect.any(Uint8Array));
    expect(gl.texImage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    expect(gl.compressedTexImage2D).not.toHaveBeenCalled();
  });

  it('returns false when neither native support nor a decoder is available', () => {
    const gl = makeGl({});
    expect(uploadGlCompressedTextureContainer(gl, makeContainer(), new Uint8Array(16))).toBe(false);
    expect(gl.compressedTexImage2D).not.toHaveBeenCalled();
    expect(gl.texImage2D).not.toHaveBeenCalled();
  });

  it('returns false when the decoder cannot handle the format', () => {
    const gl = makeGl({});
    const decode = vi.fn(() => null);
    expect(uploadGlCompressedTextureContainer(gl, makeContainer(), new Uint8Array(16), decode)).toBe(false);
  });

  it('slices each level from the payload at its byte range', () => {
    const gl = makeGl({ WEBGL_compressed_texture_s3tc: S3TC_EXT });
    const container: TextureContainer = {
      ...makeContainer(),
      mipLevels: 2,
      levels: [
        { byteOffset: 0, byteLength: 16, width: 4, height: 4 },
        { byteOffset: 16, byteLength: 8, width: 2, height: 2 },
      ],
    };
    const payload = new Uint8Array(24);
    uploadGlCompressedTextureContainer(gl, container, payload);
    expect(gl.compressedTexImage2D).toHaveBeenCalledTimes(2);
    const secondCall = (gl.compressedTexImage2D as ReturnType<typeof vi.fn>).mock.calls[1];
    const view = secondCall[6] as Uint8Array;
    expect(view.byteOffset).toBe(16);
    expect(view.byteLength).toBe(8);
  });

  it('returns false without uploading when the container is still supercompressed', () => {
    const gl = makeGl({ WEBGL_compressed_texture_s3tc: S3TC_EXT });
    const container: TextureContainer = { ...makeContainer(), supercompression: 'Zstd' };
    expect(uploadGlCompressedTextureContainer(gl, container, new Uint8Array(16))).toBe(false);
    expect(gl.compressedTexImage2D).not.toHaveBeenCalled();
    expect(gl.texImage2D).not.toHaveBeenCalled();
  });

  it('rejects volume and cubemap-array shapes instead of uploading them through a wrong target', () => {
    const gl = makeGl({ WEBGL_compressed_texture_s3tc: S3TC_EXT });
    expect(uploadGlCompressedTextureContainer(gl, { ...makeContainer(), depth: 2 }, new Uint8Array(16))).toBe(false);
    expect(
      uploadGlCompressedTextureContainer(gl, { ...makeContainer(), faces: 6, layers: 2 }, new Uint8Array(16)),
    ).toBe(false);
    expect(gl.compressedTexImage2D).not.toHaveBeenCalled();
    expect(gl.compressedTexSubImage3D).not.toHaveBeenCalled();
    expect(gl.texStorage3D).not.toHaveBeenCalled();
  });

  it('targets each cube face from the flat mip+face index', () => {
    const gl = makeGl({ WEBGL_compressed_texture_s3tc: S3TC_EXT });
    // A single-mip cubemap: six faces, flat index === face since mipLevels === 1.
    const levels = Array.from({ length: 6 }, (_unused, face) => ({
      byteOffset: face * 16,
      byteLength: 16,
      width: 4,
      height: 4,
    }));
    const container: TextureContainer = { ...makeContainer(), faces: 6, levels };
    uploadGlCompressedTextureContainer(gl, container, new Uint8Array(6 * 16));
    expect(gl.compressedTexImage2D).toHaveBeenCalledTimes(6);
    const calls = (gl.compressedTexImage2D as ReturnType<typeof vi.fn>).mock.calls;
    for (let face = 0; face < 6; face += 1) {
      expect(calls[face][0]).toBe(gl.TEXTURE_CUBE_MAP_POSITIVE_X + face);
      expect(calls[face][1]).toBe(0);
    }
    expect(gl.texStorage3D).not.toHaveBeenCalled();
  });

  it('allocates immutable storage once and sub-uploads each layer of an array into TEXTURE_2D_ARRAY', () => {
    const gl = makeGl({ WEBGL_compressed_texture_s3tc: S3TC_EXT });
    // A single-mip, two-layer array (layer-major): flat index 0 = layer 0, index 1 = layer 1.
    const container: TextureContainer = {
      ...makeContainer(),
      layers: 2,
      levels: [
        { byteOffset: 0, byteLength: 16, width: 4, height: 4 },
        { byteOffset: 16, byteLength: 16, width: 4, height: 4 },
      ],
    };
    uploadGlCompressedTextureContainer(gl, container, new Uint8Array(32));
    expect(gl.texStorage3D).toHaveBeenCalledTimes(1);
    expect(gl.texStorage3D).toHaveBeenCalledWith(gl.TEXTURE_2D_ARRAY, 1, 0x83f3, 4, 4, 2);
    expect(gl.compressedTexSubImage3D).toHaveBeenCalledTimes(2);
    const subCalls = (gl.compressedTexSubImage3D as ReturnType<typeof vi.fn>).mock.calls;
    expect(subCalls[0][4]).toBe(0);
    expect(subCalls[1][4]).toBe(1);
    expect(gl.compressedTexImage2D).not.toHaveBeenCalled();
  });

  it('returns false for a cubemap the device cannot upload natively (no face-by-face decode)', () => {
    const gl = makeGl({});
    const container: TextureContainer = { ...makeContainer(), faces: 6 };
    const decode = vi.fn(() => new Uint8ClampedArray(4 * 4 * 4));
    expect(uploadGlCompressedTextureContainer(gl, container, new Uint8Array(6 * 16), decode)).toBe(false);
    expect(decode).not.toHaveBeenCalled();
    expect(gl.texImage2D).not.toHaveBeenCalled();
  });
});
