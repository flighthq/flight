import type {
  GlCompressedTextureDecoder,
  GlCompressedTextureSupport,
  GlRenderState,
  ImageResource,
  TextureContainer,
  TextureContainerFormat,
} from '@flighthq/types';

import { getGlRenderStateRuntime } from './glRenderState';

// GPU-native block-compressed texture upload for WebGL2: hand a parsed TextureContainer (KTX2 / DDS /
// ATF) plus its byte payload and this pushes every mip level straight to the GPU with
// `compressedTexImage2D` — no CPU decode — when the device exposes the matching
// `WEBGL_compressed_texture_*` extension. When it does not, an optional RGBA decode seam turns each
// level into plain pixels the portable `texImage2D` path uploads, so an asset still renders on
// hardware missing that block format (desktop S3TC/BPTC vs mobile ETC2/ASTC).
//
// Detection is done once per context via `detectGlCompressedTextureSupport`; the format→GL-enum
// mapping reads the live extension objects, so the enum constants come from the browser, not a baked
// table. Basis intermediate formats (`etc1s`/`uastc`) are NOT uploaded here — they must be transcoded
// to a concrete BCn/ETC/ASTC format first (see the deferred `@flighthq/texture-transcode` seam).

// Probes which block-compressed families the WebGL2 context can upload natively, from its
// `WEBGL_compressed_texture_*` extensions. Call once per context and cache the result; each `getExtension`
// activates the extension so the enum constants become readable by `getGlCompressedTextureFormat`.
export function detectGlCompressedTextureSupport(gl: WebGL2RenderingContext): GlCompressedTextureSupport {
  return {
    astc: gl.getExtension('WEBGL_compressed_texture_astc') !== null,
    bptc: gl.getExtension('EXT_texture_compression_bptc') !== null,
    etc: gl.getExtension('WEBGL_compressed_texture_etc') !== null,
    pvrtc: gl.getExtension('WEBGL_compressed_texture_pvrtc') !== null,
    rgtc: gl.getExtension('EXT_texture_compression_rgtc') !== null,
    s3tc:
      gl.getExtension('WEBGL_compressed_texture_s3tc') !== null &&
      gl.getExtension('WEBGL_compressed_texture_s3tc_srgb') !== null,
  };
}

// Resolves the GL `internalformat` enum for a container format from the device's live compression
// extensions, or -1 when the device cannot upload that format natively (missing extension, or an
// uncompressed / Basis-intermediate format that is not a `compressedTexImage2D` target). The returned
// number is the exact enum `compressedTexImage2D` expects, read off the extension object so it matches
// the running browser. Requires the relevant extension to already be enabled (call
// `detectGlCompressedTextureSupport` first).
export function getGlCompressedTextureFormat(gl: WebGL2RenderingContext, format: TextureContainerFormat): number {
  const s3tc = gl.getExtension('WEBGL_compressed_texture_s3tc') as Record<string, number> | null;
  const s3tcSrgb = gl.getExtension('WEBGL_compressed_texture_s3tc_srgb') as Record<string, number> | null;
  const rgtc = gl.getExtension('EXT_texture_compression_rgtc') as Record<string, number> | null;
  const bptc = gl.getExtension('EXT_texture_compression_bptc') as Record<string, number> | null;
  const etc = gl.getExtension('WEBGL_compressed_texture_etc') as Record<string, number> | null;
  const astc = gl.getExtension('WEBGL_compressed_texture_astc') as Record<string, number> | null;
  const pvrtc = gl.getExtension('WEBGL_compressed_texture_pvrtc') as Record<string, number> | null;
  const enumFromExt = (ext: Record<string, number> | null | undefined, key: string): number =>
    typeof ext?.[key] === 'number' ? ext[key] : -1;

  switch (format) {
    case 'bc1':
      return enumFromExt(s3tc, 'COMPRESSED_RGBA_S3TC_DXT1_EXT');
    case 'bc1Srgb':
      return enumFromExt(s3tcSrgb, 'COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT');
    case 'bc2':
      return enumFromExt(s3tc, 'COMPRESSED_RGBA_S3TC_DXT3_EXT');
    case 'bc2Srgb':
      return enumFromExt(s3tcSrgb, 'COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT');
    case 'bc3':
      return enumFromExt(s3tc, 'COMPRESSED_RGBA_S3TC_DXT5_EXT');
    case 'bc3Srgb':
      return enumFromExt(s3tcSrgb, 'COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT');
    case 'bc4':
      return enumFromExt(rgtc, 'COMPRESSED_RED_RGTC1_EXT');
    case 'bc4Snorm':
      return enumFromExt(rgtc, 'COMPRESSED_SIGNED_RED_RGTC1_EXT');
    case 'bc5':
      return enumFromExt(rgtc, 'COMPRESSED_RED_GREEN_RGTC2_EXT');
    case 'bc5Snorm':
      return enumFromExt(rgtc, 'COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT');
    case 'bc6hUfloat':
      return enumFromExt(bptc, 'COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT');
    case 'bc6hSfloat':
      return enumFromExt(bptc, 'COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT');
    case 'bc7':
      return enumFromExt(bptc, 'COMPRESSED_RGBA_BPTC_UNORM_EXT');
    case 'bc7Srgb':
      return enumFromExt(bptc, 'COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT');
    case 'etc1':
    case 'etc2Rgb':
      return enumFromExt(etc, 'COMPRESSED_RGB8_ETC2');
    case 'etc2RgbSrgb':
      return enumFromExt(etc, 'COMPRESSED_SRGB8_ETC2');
    case 'etc2Rgba':
      return enumFromExt(etc, 'COMPRESSED_RGBA8_ETC2_EAC');
    case 'etc2RgbaSrgb':
      return enumFromExt(etc, 'COMPRESSED_SRGB8_ALPHA8_ETC2_EAC');
    case 'etc2RgbA1':
      return enumFromExt(etc, 'COMPRESSED_RGB8_PUNCHTHROUGH_ALPHA1_ETC2');
    case 'etc2RgbA1Srgb':
      return enumFromExt(etc, 'COMPRESSED_SRGB8_PUNCHTHROUGH_ALPHA1_ETC2');
    case 'eacR11':
      return enumFromExt(etc, 'COMPRESSED_R11_EAC');
    case 'eacR11Snorm':
      return enumFromExt(etc, 'COMPRESSED_SIGNED_R11_EAC');
    case 'eacRg11':
      return enumFromExt(etc, 'COMPRESSED_RG11_EAC');
    case 'eacRg11Snorm':
      return enumFromExt(etc, 'COMPRESSED_SIGNED_RG11_EAC');
    case 'pvrtc2bppRgb':
      return enumFromExt(pvrtc, 'COMPRESSED_RGB_PVRTC_2BPPV1_IMG');
    case 'pvrtc2bppRgba':
      return enumFromExt(pvrtc, 'COMPRESSED_RGBA_PVRTC_2BPPV1_IMG');
    case 'pvrtc4bppRgb':
      return enumFromExt(pvrtc, 'COMPRESSED_RGB_PVRTC_4BPPV1_IMG');
    case 'pvrtc4bppRgba':
      return enumFromExt(pvrtc, 'COMPRESSED_RGBA_PVRTC_4BPPV1_IMG');
    case 'astc4x4':
      return enumFromExt(astc, 'COMPRESSED_RGBA_ASTC_4x4_KHR');
    case 'astc5x4':
      return enumFromExt(astc, 'COMPRESSED_RGBA_ASTC_5x4_KHR');
    case 'astc5x5':
      return enumFromExt(astc, 'COMPRESSED_RGBA_ASTC_5x5_KHR');
    case 'astc6x5':
      return enumFromExt(astc, 'COMPRESSED_RGBA_ASTC_6x5_KHR');
    case 'astc6x6':
      return enumFromExt(astc, 'COMPRESSED_RGBA_ASTC_6x6_KHR');
    case 'astc8x5':
      return enumFromExt(astc, 'COMPRESSED_RGBA_ASTC_8x5_KHR');
    case 'astc8x6':
      return enumFromExt(astc, 'COMPRESSED_RGBA_ASTC_8x6_KHR');
    case 'astc8x8':
      return enumFromExt(astc, 'COMPRESSED_RGBA_ASTC_8x8_KHR');
    case 'astc10x5':
      return enumFromExt(astc, 'COMPRESSED_RGBA_ASTC_10x5_KHR');
    case 'astc10x6':
      return enumFromExt(astc, 'COMPRESSED_RGBA_ASTC_10x6_KHR');
    case 'astc10x8':
      return enumFromExt(astc, 'COMPRESSED_RGBA_ASTC_10x8_KHR');
    case 'astc10x10':
      return enumFromExt(astc, 'COMPRESSED_RGBA_ASTC_10x10_KHR');
    case 'astc12x10':
      return enumFromExt(astc, 'COMPRESSED_RGBA_ASTC_12x10_KHR');
    case 'astc12x12':
      return enumFromExt(astc, 'COMPRESSED_RGBA_ASTC_12x12_KHR');
    default:
      // Uncompressed and Basis-intermediate formats have no compressedTexImage2D enum.
      return -1;
  }
}

// True when the device's detected support covers a container format's family — the cheap, GL-free gate
// an asset pipeline uses to pick which of several shipped encodings to upload, without touching the
// context. `srgb` twins ride the same extension as their unorm base, so both report against one flag.
export function hasGlCompressedTextureFormat(
  support: Readonly<GlCompressedTextureSupport>,
  format: TextureContainerFormat,
): boolean {
  switch (format) {
    case 'bc1':
    case 'bc1Srgb':
    case 'bc2':
    case 'bc2Srgb':
    case 'bc3':
    case 'bc3Srgb':
      return support.s3tc;
    case 'bc4':
    case 'bc4Snorm':
    case 'bc5':
    case 'bc5Snorm':
      return support.rgtc;
    case 'bc6hUfloat':
    case 'bc6hSfloat':
    case 'bc7':
    case 'bc7Srgb':
      return support.bptc;
    case 'etc1':
    case 'etc2Rgb':
    case 'etc2RgbSrgb':
    case 'etc2Rgba':
    case 'etc2RgbaSrgb':
    case 'etc2RgbA1':
    case 'etc2RgbA1Srgb':
    case 'eacR11':
    case 'eacR11Snorm':
    case 'eacRg11':
    case 'eacRg11Snorm':
      return support.etc;
    case 'pvrtc2bppRgb':
    case 'pvrtc2bppRgba':
    case 'pvrtc4bppRgb':
    case 'pvrtc4bppRgba':
      return support.pvrtc;
    default:
      return isAstcFormat(format) ? support.astc : false;
  }
}

// Installs the RGBA fallback decoder used when the device cannot upload a compressed container's format
// natively — the seam that lets an S3TC/BPTC asset still render on mobile ETC2/ASTC hardware (and vice
// versa) by decoding each level to plain pixels. Opt-in and last-write-wins: a state that never draws a
// compressed texture the device lacks never installs one, so the decoder (and any WASM block-codec it
// wraps) tree-shakes out. Pass null to clear a previously installed decoder.
export function registerGlCompressedTextureDecoder(
  state: GlRenderState,
  decode: GlCompressedTextureDecoder | null,
): void {
  getGlRenderStateRuntime(state).compressedTextureDecoder = decode;
}

// Installs the block-compressed upload seam on a render state, opting the ~40-format
// uploadGlCompressedTextureContainer path into the bundle only for a state that actually draws a
// compressed texture. The 2D display draw path (uploadGlDisplayTexture) reads the installed handler off
// the runtime and skips a compressed-only resource when none is registered, so a plain element/data
// bitmap never carries the compression enum table. Opt-in and last-write-wins; pass null to clear a
// previously installed uploader. The installed handler bridges a compressed ImageResource to
// uploadGlCompressedTextureContainer, threading through any registered RGBA decode fallback.
export function registerGlCompressedTextureUpload(state: GlRenderState, uploader?: null): void {
  getGlRenderStateRuntime(state).compressedTextureUpload = uploader === null ? null : uploadGlCompressedImageResource;
}

// Uploads every stored sub-image of a compressed container to the texture the caller has bound. Takes
// the GPU-native `compressedTexImage2D`/`compressedTexImage3D` path when the device supports the
// container's format; otherwise, if a `decode` seam is supplied, decompresses each 2D level to RGBA and
// uploads it through the portable pixel path. Returns `true` when the container was uploaded (either
// path), `false` when the format is neither natively supported nor decodable, or when the container is
// still supercompressed (`supercompression !== 'None'`) — a sentinel, not a throw, so a caller falls
// back to a different asset (or inflates/transcodes first). The caller owns creating/binding the
// texture (to gl.TEXTURE_2D, gl.TEXTURE_CUBE_MAP, or gl.TEXTURE_2D_ARRAY per the container's shape) and
// setting sampler/mip state; this uploads only the container's own sub-images.
// Volume and cubemap-array shapes return false without issuing GL calls; they require distinct
// target/layout realizations rather than being flattened through the supported targets.
//
// `container.levels` is the flat subresource list in `mip + (face + layer * faces) * mipLevels` order;
// each flat index is decoded back to (mip, face, layer) so a cubemap's six faces land on
// gl.TEXTURE_CUBE_MAP_POSITIVE_X + face and an array's layers slice into a gl.TEXTURE_2D_ARRAY. The
// RGBA decode fallback covers only the plain 2D case (faces === 1, layers === 1); a compressed cubemap
// or array with no native support reports failure rather than a partial 2D upload.
export function uploadGlCompressedTextureContainer(
  gl: WebGL2RenderingContext,
  container: Readonly<TextureContainer>,
  payload: Readonly<Uint8Array>,
  decode?: GlCompressedTextureDecoder,
): boolean {
  // This atom realizes 2D, one cubemap, or a 2D array. A volume needs TEXTURE_3D allocation and
  // depth-slice layout; a cubemap array needs a distinct target/extension. Reject those shapes before
  // issuing any GL call rather than uploading their first slice as a plausible but incorrect 2D image.
  if (!isSupportedGlCompressedTextureContainerShape(container)) return false;
  // A still-wrapped supercompressed payload (Zstd/ZLIB deflate or BasisLZ transcode) is not block data;
  // uploading it as if it were would push corrupt pixels. Fail the sentinel and let the caller inflate
  // or transcode through the deferred seam first.
  if (container.supercompression !== 'None') return false;

  const nativeFormat = getGlCompressedTextureFormat(gl, container.format);
  const faces = container.faces;
  const layers = container.layers;
  const mipLevels = container.mipLevels;

  if (nativeFormat !== -1) {
    // An array texture is immutable storage: allocate the whole mip chain × depth once with
    // texStorage3D, then blit each layer's slice into its depth slot (layers are non-contiguous in the
    // layer-major flat list, so per-subresource upload is required; compressedTexImage3D cannot
    // allocate a null store the way the 2D path does).
    if (layers > 1) {
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, mipLevels, nativeFormat, container.width, container.height, layers);
    }
    for (let index = 0; index < container.levels.length; index += 1) {
      const entry = container.levels[index];
      const view = new Uint8Array(payload.buffer, payload.byteOffset + entry.byteOffset, entry.byteLength);
      const mip = index % mipLevels;
      const faceLayer = (index - mip) / mipLevels;
      const face = faceLayer % faces;
      const layer = (faceLayer - face) / faces;
      if (layers > 1) {
        gl.compressedTexSubImage3D(
          gl.TEXTURE_2D_ARRAY,
          mip,
          0,
          0,
          layer,
          entry.width,
          entry.height,
          1,
          nativeFormat,
          view,
        );
      } else {
        const target = faces === 6 ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + face : gl.TEXTURE_2D;
        gl.compressedTexImage2D(target, mip, nativeFormat, entry.width, entry.height, 0, view);
      }
    }
    return true;
  }

  // RGBA decode fallback: plain 2D only. A cubemap/array with no native block support is not decoded
  // face-by-face here — report failure so the caller supplies a different encoding.
  if (decode === undefined || faces !== 1 || layers !== 1) return false;
  for (let mip = 0; mip < container.levels.length; mip += 1) {
    const entry = container.levels[mip];
    const view = new Uint8Array(payload.buffer, payload.byteOffset + entry.byteOffset, entry.byteLength);
    const rgba = decode(container.format, entry.width, entry.height, view);
    if (rgba === null) return false;
    gl.texImage2D(gl.TEXTURE_2D, mip, gl.RGBA, entry.width, entry.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }
  return true;
}

function isAstcFormat(format: TextureContainerFormat): boolean {
  return format.startsWith('astc');
}

function isSupportedGlCompressedTextureContainerShape(container: Readonly<TextureContainer>): boolean {
  if (container.depth !== 1 || !Number.isInteger(container.layers) || container.layers < 1) return false;
  if (container.faces === 1) return true;
  return container.faces === 6 && container.layers === 1;
}

// The installed GlCompressedTextureUploader: bridges a compressed ImageResource to the container upload,
// threading through any registered RGBA decode fallback. Returns false when the resource carries no
// compressed payload so the display path leaves the texture as-is rather than uploading garbage.
function uploadGlCompressedImageResource(
  gl: WebGL2RenderingContext,
  image: Readonly<ImageResource>,
  decode: GlCompressedTextureDecoder | null,
): boolean {
  const compressed = image.compressed;
  if (compressed === null) return false;
  const container = compressed.container;
  // bindGlImageResourceTexture installs this bridge while TEXTURE_2D is bound. Cube, array, and volume
  // resources require their own entity/binder families; forwarding one here would address an unbound
  // target even though the low-level container uploader supports caller-bound cube and 2D-array targets.
  if (container.depth !== 1 || container.faces !== 1 || container.layers !== 1) return false;
  return uploadGlCompressedTextureContainer(gl, container, compressed.payload, decode ?? undefined);
}
