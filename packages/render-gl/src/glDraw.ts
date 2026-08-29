import { withRegistryTableEntry } from '@flighthq/registry/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type {
  GlContext,
  Bitmap,
  CompressedImage,
  GlBitmapShader,
  GlBlendRealization,
  GlBlendSignature,
  GlRenderState,
  GlRenderStateRuntime,
  GlTextureRealization,
  TextureSource,
  TextureColorSpace,
  Image,
  SamplerLike,
  TextureLike,
  TextureFilter,
  TextureWrap,
} from '@flighthq/types/contract';
import { BlendMode, RegistryEntryState } from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState';
import { ensureDefaultGlBitmapShader, setGlAttributes, setGlMatrixFromValues } from './glShader';
import { uploadGlTextureData, uploadGlTextureElement } from './glTextureUpload';
import { uploadGlTextureVideoFrame } from './glTextureVideoUpload';

// Applies the blend mode's registered fixed-function realization to the GL context, skipping the
// work only when its resolved numeric signature is unchanged. A mode with no registered realization (an unregistered vendor
// mode, or a built-in with no fixed-function equivalent such as Overlay) degrades to normal
// premultiplied compositing. Register realizations with registerGlBlendMode /
// registerDefaultGlBlendModes before drawing.
export function applyGlBlendMode(state: GlRenderState, blendMode: BlendMode | null): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const entry = blendMode !== null ? runtime.registries.blendRealizations.entries.get(blendMode) : null;
  const realization = entry?.state === RegistryEntryState.Bound ? entry.value : NORMAL_BLEND;
  const signature: GlBlendSignature = {
    dst: gl[realization.dst],
    equation: gl[realization.equation ?? 'FUNC_ADD'],
    src: gl[realization.src],
  };
  const current = runtime.currentBlendSignature;
  if (
    current !== null &&
    current.dst === signature.dst &&
    current.equation === signature.equation &&
    current.src === signature.src
  )
    return;
  gl.blendEquation(signature.equation);
  gl.blendFunc(signature.src, signature.dst);
  runtime.currentBlendSignature = signature;
}

// Applies a sampler's wrap, filtering, anisotropy, and mip chain to the currently-bound TEXTURE_2D.
// Without a sampler it falls back to the clamp-to-edge, no-mips 2D bitmap/sprite default, filtered by
// `smoothingOverride` when the caller supplies one (a per-bitmap `smoothing` flag) and otherwise by the
// state's global `allowSmoothing`. With a sampler, every field comes from the descriptor. The mip chain
// is generated once per texture (tracked in runtime.mipmappedTextures) the first time a mip-sampling
// filter asks for it, so a shared texture first bound without mips and later with them still generates
// its chain. Filtering and wrap are set every bind (cheap) so a texture shared across samplers follows
// the current draw; only the one-time mip generation is gated.
export function applyGlSamplerState(
  state: GlRenderState,
  runtime: GlRenderStateRuntime,
  texture: WebGLTexture,
  sampler: Readonly<SamplerLike> | null,
  smoothingOverride: boolean | null = null,
): void {
  const gl = state.gl;
  if (!sampler) {
    const smooth = smoothingOverride ?? state.allowSmoothing;
    const filter = smooth ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return;
  }
  const useMips = sampler.mipmaps && isGlMipmapFilter(sampler.minFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glMinFilterValue(gl, sampler.minFilter, useMips));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glMagFilterValue(gl, sampler.magFilter));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, glTextureWrapValue(gl, sampler.wrapU));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, glTextureWrapValue(gl, sampler.wrapV));
  const ext = ensureGlAnisotropyExt(state, runtime);
  if (ext) {
    // Clamp the requested level to [1, hardware max]; 1 disables anisotropy and also resets a texture
    // that a previous anisotropic sampler left elevated.
    const level = Math.max(1, Math.min(sampler.anisotropy, runtime.maxAnisotropy ?? 1));
    gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, level);
  }
  if (useMips) {
    const mipped = (runtime.mipmappedTextures ??= new WeakSet<WebGLTexture>());
    if (!mipped.has(texture)) {
      gl.generateMipmap(gl.TEXTURE_2D);
      mipped.add(texture);
    }
  }
}

export function bindGlBitmapTexture(
  state: GlRenderState,
  bitmap: Readonly<Bitmap>,
  sampler?: Readonly<SamplerLike> | null,
  smoothingOverride?: boolean | null,
  premultiply = false,
  colorSpace: TextureColorSpace = 'linear',
): WebGLTexture {
  return bindGlTextureSourceTexture(
    state,
    bitmap,
    sampler,
    smoothingOverride,
    premultiply,
    false,
    colorSpace,
    uploadGlBitmap,
  );
}

export function bindGlCompressedImageTexture(
  state: GlRenderState,
  image: Readonly<CompressedImage>,
  sampler?: Readonly<SamplerLike> | null,
  smoothingOverride?: boolean | null,
  colorSpace: TextureColorSpace = 'linear',
): WebGLTexture {
  return bindGlTextureSourceTexture(
    state,
    image,
    sampler,
    smoothingOverride,
    false,
    true,
    colorSpace,
    uploadGlCompressedImage,
  );
}

// Binds (uploading + caching on first use, re-uploading when the host image changes) the GL texture for
// an Image and applies the sampler's full state. The Bitmap and CompressedImage siblings below
// share only the identity/version cache bracket; each source keeps a representation-specific uploader.
// Sampler state is re-applied every bind so a resource reused by two materials with different samplers
// follows the current draw.
//
// `premultiply` states whether the caller wants a premultiplied GPU texture — bind never premultiplies on
// its own. BOTH towers blend premultiplied; what differs is WHERE the multiply happens, and that is the
// distinction this flag encodes. The encoded-working-space 2D display and particle pipelines pass true
// and take it at UPLOAD, through UNPACK_PREMULTIPLY_ALPHA_WEBGL. The linear-working-space 3D mesh and
// particle paths leave the default false and premultiply in the SHADER after sample-time decode. The two
// request modes cache separate GL textures so one source can be sampled by both paths without rewriting
// its other realization.
//
// That difference is not cosmetic, and it is the constraint on re-enabling sRGB decode for 2D: an upload
// multiply runs on raw encoded bytes, so decoding on sample would yield decode(c·a) where the blend needs
// decode(c)·a. A shader multiply runs after the decode, in the working space, and is unaffected. See
// agents/texture-color-space-model.md.
export function bindGlImageResourceTexture(
  state: GlRenderState,
  image: Readonly<Image>,
  sampler?: Readonly<SamplerLike> | null,
  smoothingOverride?: boolean | null,
  premultiply = false,
  colorSpace: TextureColorSpace = 'linear',
): WebGLTexture {
  return bindGlTextureSourceTexture(
    state,
    image,
    sampler,
    smoothingOverride,
    premultiply,
    false,
    colorSpace,
    uploadGlImageResource,
  );
}

// Binds (uploading + caching on first use) the GL texture for an image source and applies the given
// sampler's full sampling state — wrap, min/mag filter, anisotropy, and a generated mip chain — to
// the bound texture. Sampler state is re-applied on every bind, not baked at creation, because the GL
// texture is cached by image source alone: one image reused by two materials with different samplers
// (e.g. a map bound as both normal and metallic-roughness with different sampling) shares one GL
// texture, so its sampling must follow the current draw rather than whoever uploaded it first. WebGL2
// allows REPEAT and mipmaps on NPOT textures, so no power-of-two constraint applies. Callers without a
// sampler (2D bitmap/text/sprite) get the historical default: the state's allowSmoothing filter,
// clamp-to-edge, and no mip chain. See applyGlSamplerState.
export function bindGlTexture(
  state: GlRenderState,
  imageSource: CanvasImageSource,
  sampler?: Readonly<SamplerLike> | null,
): WebGLTexture {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const textureCache = runtime.textureCache;
  let texture = textureCache.get(imageSource);
  if (!texture) {
    texture = gl.createTexture()!;
    bindGlTextureRealization(state, { straightAlpha: false, texture });
    // Both image and canvas sources present straight (un-premultiplied) alpha to texImage2D, so
    // premultiply on upload to match the premultiplied (ONE, ONE_MINUS_SRC_ALPHA) blend used
    // everywhere — uploaded images, canvas-backed shapes/text, and render-target composites. (A
    // straight-alpha texture under premultiplied blend blows RGB out to full, turning a 40%-white
    // shape opaque white.) Mirrors updateGlTexture, which already premultiplies canvas uploads.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageSource as TexImageSource);
    textureCache.set(imageSource, texture);
  } else {
    // Always rebind on a cache hit: the binding tracker is unit-blind and records the last
    // texture bound to whatever unit was active THEN, but callers change the active unit between binds
    // (a material binds its maps to units 0..4 via gl.activeTexture). Binding one image source to two
    // units — e.g. a map reused as both normal and metallic-roughness — would otherwise leave the
    // second unit unbound. A rebind is one cheap GL call; the quad-batch writer binds once per batch, so the
    // dropped skip costs nothing meaningful.
    bindGlTextureRealization(state, { straightAlpha: false, texture });
  }
  // texture is the active TEXTURE_2D binding in every path above; apply this draw's sampler state here
  // so a cache hit picks it up instead of the first uploader's.
  applyGlSamplerState(state, runtime, texture, sampler ?? null);
  return texture;
}

function bindGlTextureSourceTexture(
  state: GlRenderState,
  image: Readonly<TextureSource>,
  sampler: Readonly<SamplerLike> | null | undefined,
  smoothingOverride: boolean | null | undefined,
  premultiply: boolean,
  straightAlpha: boolean,
  colorSpace: TextureColorSpace,
  upload: GlTextureSourceUpload,
): WebGLTexture {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const cache = premultiply
    ? colorSpace === 'srgb'
      ? runtime.textureSourcePremultipliedSrgbTextureCache
      : runtime.textureSourcePremultipliedTextureCache
    : colorSpace === 'srgb'
      ? runtime.textureSourceStraightSrgbTextureCache
      : runtime.textureSourceStraightTextureCache;
  let entry = cache.get(image);
  if (entry === undefined) {
    entry = { texture: gl.createTexture()!, version: -1 };
    cache.set(image, entry);
  }
  bindGlTextureRealization(state, { straightAlpha, texture: entry.texture });
  if (entry.version !== image.version) {
    upload(state, image, premultiply, colorSpace);
    entry.version = image.version;
  }
  applyGlSamplerState(state, runtime, entry.texture, sampler ?? null, smoothingOverride ?? null);
  return entry.texture;
}

// The single writer for the texture binding shadow. A handle and its alpha interpretation are
// published together, so no caller can leave one half describing a prior binding.
export function bindGlTextureRealization(
  state: GlRenderState,
  realization: Readonly<GlTextureRealization> | null,
): WebGLTexture | null {
  state.gl.bindTexture(state.gl.TEXTURE_2D, realization?.texture ?? null);
  getGlRenderStateRuntime(state).currentTextureRealization = realization;
  return realization?.texture ?? null;
}

// Binds the GL texture for a video-backed Texture and re-uploads the source element's current frame
// only when its Image `version` has advanced — the dynamic, per-frame sibling of
// bindGlImageResourceTexture (settled Image) and bindGlTexture (raw element). The GL texture is
// cached by Image identity plus Texture.colorSpace, so two sampled Textures share one upload only
// when they request the same GPU interpretation while their samplers remain draw-local.
// Leaves the texture bound at the active unit for the caller to sample. Callers advance the source
// version via advanceVideoTexture when the element reports a fresh decoded frame; this reads the current frame
// through uploadGlTextureElement's zero-copy element fast-path.
export function bindGlVideoTexture(
  state: GlRenderState,
  texture: Readonly<TextureLike>,
  sampler?: Readonly<SamplerLike> | null,
): WebGLTexture {
  const image = getTextureSource(texture) as Image;
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const cache =
    texture.colorSpace === 'srgb'
      ? (runtime.videoSrgbTextureCache ??= new WeakMap())
      : (runtime.videoTextureCache ??= new WeakMap());
  let entry = cache.get(image);
  if (entry === undefined) {
    entry = { texture: gl.createTexture()!, uploadedVersion: -1 };
    cache.set(image, entry);
  }
  bindGlTextureRealization(state, { straightAlpha: false, texture: entry.texture });
  // Straight-alpha element under premultiplied blend would blow out RGB; match the bitmap/element path.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  entry.uploadedVersion = uploadGlTextureVideoFrame(
    gl,
    image,
    entry.uploadedVersion,
    texture.colorSpace === 'srgb' ? gl.SRGB8_ALPHA8 : gl.RGBA,
  );
  applyGlSamplerState(state, runtime, entry.texture, sampler ?? texture.sampler);
  return entry.texture;
}

export function createGlTexture(state: GlRenderState): WebGLTexture {
  const gl = state.gl;
  const filter = state.allowSmoothing ? gl.LINEAR : gl.NEAREST;
  const texture = gl.createTexture()!;
  bindGlTextureRealization(state, { straightAlpha: false, texture });
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

export function drawGlQuad(
  state: GlRenderState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const { quadVertexData, quadVertexBuffer, quadIndexBuffer } = runtime;
  const locations = runtime.currentShader?.locations;
  const v = quadVertexData;
  v[0] = x0;
  v[1] = y0;
  v[2] = u0;
  v[3] = v0;
  v[4] = x1;
  v[5] = y0;
  v[6] = u1;
  v[7] = v0;
  v[8] = x1;
  v[9] = y1;
  v[10] = u1;
  v[11] = v1;
  v[12] = x0;
  v[13] = y1;
  v[14] = u0;
  v[15] = v1;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIndexBuffer);
  setGlAttributes(gl, locations!);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
}

export function enableGlBlendModeSupport(state: GlRenderState): void {
  registerDefaultGlBlendModes(state);
  state.applyBlendMode = applyGlBlendMode;
}

// Reports whether the render state has a fixed-function realization registered for the mode. A false
// result means applyGlBlendMode would fall back to normal compositing for it — either an unregistered
// vendor mode or a built-in (Overlay, HardLight, Difference, Invert) that needs a shader pass.
export function isBlendModeSupported(state: GlRenderState, blendMode: BlendMode): boolean {
  return (
    getGlRenderStateRuntime(state).registries.blendRealizations.entries.get(blendMode)?.state ===
    RegistryEntryState.Bound
  );
}

// Registers the built-in fixed-function blend modes on the state. Overlay/HardLight/Difference/Invert
// are intentionally omitted — they have no fixed-function equivalent and need a shader pass — so they
// stay unregistered and fall back to normal compositing.
export function registerDefaultGlBlendModes(state: GlRenderState): void {
  for (const [mode, realization] of DEFAULT_GL_BLEND_MODES) registerGlBlendMode(state, mode, realization);
}

// Binds a fixed-function realization to a blend mode on this render state. Last-write-wins, so a
// caller can override a built-in mode or add a vendor-prefixed one. Replacing the persistent table
// leaves any already-derived render state on its prior snapshot.
export function registerGlBlendMode(state: GlRenderState, blendMode: BlendMode, realization: GlBlendRealization): void {
  const runtime = getGlRenderStateRuntime(state);
  runtime.registries.blendRealizations = withRegistryTableEntry(
    runtime.registries.blendRealizations,
    blendMode,
    realization,
  );
}

export function setGlQuadMatrixFromOffset(
  state: GlRenderState,
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
): void {
  const runtime = getGlRenderStateRuntime(state);
  setGlMatrixFromValues(
    state.gl,
    runtime.currentShader!.locations!,
    runtime.matrixArray,
    a,
    b,
    c,
    d,
    tx + a * dx + c * dy,
    ty + b * dx + d * dy,
    runtime.renderTargetViewport?.width ?? state.gl.drawingBufferWidth,
    runtime.renderTargetViewport?.height ?? state.gl.drawingBufferHeight,
  );
}

export function updateGlTexture(state: GlRenderState, texture: WebGLTexture, canvas: HTMLCanvasElement): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  // Always rebind before uploading — the binding shadow is unit-blind (see bindGlTexture), so a
  // skip could upload into whatever is bound on the currently-active unit instead of `texture`.
  bindGlTextureRealization(state, { straightAlpha: false, texture });
  // Browsers pass canvas pixel data to Gl as straight (unmultiplied) alpha.
  // Premultiply on upload so the texture matches the (ONE, ONE_MINUS_SRC_ALPHA) blend mode.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  // Refresh the mip chain if this texture carries one (a canvas/video that opted into mipmaps); the
  // re-uploaded base level would otherwise leave stale lower mips. The 2D default has no chain, so
  // the common per-frame canvas/video upload skips the cost.
  if (runtime.mipmappedTextures?.has(texture)) gl.generateMipmap(gl.TEXTURE_2D);
}

function uploadGlBitmap(
  state: GlRenderState,
  image: Readonly<TextureSource>,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
): void {
  const bitmap = image as Readonly<Bitmap>;
  const gl = state.gl;
  // Resolve the source's declared encoding to the one the caller asked for, in EITHER direction. The
  // straight direction is what makes a premultiplied source safe as a 3D material map: 3D binds with
  // premultiply=false and its fragment tail multiplies by alpha at the end, so handing it already-
  // premultiplied rgb would square the coverage and darken every translucent texel.
  const data =
    premultiply && bitmap.alphaType !== 'premultiplied'
      ? convertRgba8AlphaEncoding(bitmap.data, true)
      : !premultiply && bitmap.alphaType === 'premultiplied'
        ? convertRgba8AlphaEncoding(bitmap.data, false)
        : bitmap.data;
  uploadGlTextureData(
    gl,
    gl.TEXTURE_2D,
    bitmap.width,
    bitmap.height,
    data,
    colorSpace === 'srgb' ? gl.SRGB8_ALPHA8 : gl.RGBA,
  );
}

function uploadGlCompressedImage(
  state: GlRenderState,
  image: Readonly<TextureSource>,
  _premultiply: boolean,
  colorSpace: TextureColorSpace,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const uploadEntry = runtime.registries.compressedTextureUpload.entry;
  if (uploadEntry?.state !== RegistryEntryState.Bound) return;
  const decoderEntry = runtime.registries.compressedTextureDecoder.entry;
  uploadEntry.value(
    state.gl,
    image as Readonly<CompressedImage>,
    decoderEntry?.state === RegistryEntryState.Bound ? decoderEntry.value : null,
    colorSpace,
  );
}

function uploadGlImageResource(
  state: GlRenderState,
  image: Readonly<TextureSource>,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
): void {
  const gl = state.gl;
  // Honour the source's declared encoding, the same way uploadGlBitmap does — a payload that already
  // folded alpha into rgb (a native decode commonly has) must not be multiplied a second time. Unlike
  // the Bitmap path there is no CPU fallback here: an Image is a borrowed host handle uploaded straight
  // through texImage2D, so this can only decline the multiply, never undo one.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply && image.alphaType !== 'premultiplied');
  uploadGlTextureElement(
    gl,
    gl.TEXTURE_2D,
    (image as Readonly<Image>).source as TexImageSource,
    colorSpace === 'srgb' ? gl.SRGB8_ALPHA8 : gl.RGBA,
  );
}

// Converts an rgba8 buffer between straight and premultiplied alpha, in either direction. Allocates, but runs
// only on a texture upload (cache miss or content change), never in the per-frame draw path.
function convertRgba8AlphaEncoding(
  data: Readonly<Uint8ClampedArray<ArrayBuffer>>,
  toPremultiplied: boolean,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    // The two directions differ only in this factor, so they share one loop rather than shipping two.
    // A fully transparent texel carries no recoverable color either way, so it stays zero instead of
    // dividing by zero on the un-premultiply side.
    const scale = toPremultiplied ? a / 255 : a === 0 ? 0 : 255 / a;
    out[i] = data[i] * scale;
    out[i + 1] = data[i + 1] * scale;
    out[i + 2] = data[i + 2] * scale;
    out[i + 3] = a;
  }
  return out;
}

type GlTextureSourceUpload = (
  state: GlRenderState,
  image: Readonly<TextureSource>,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
) => void;

export function useGlProgram(state: GlRenderState, shader?: GlBitmapShader): void {
  const runtime = getGlRenderStateRuntime(state);
  const resolved = shader ?? ensureDefaultGlBitmapShader(state);
  const program = resolved.program;
  if (runtime.currentShader?.program !== program) {
    state.gl.useProgram(program);
    runtime.currentShader = { locations: resolved.locations, program };
    return;
  }
  runtime.currentShader = { locations: resolved.locations, program };
  // The skip below is the cache being trusted: render-gl believes this program is already bound. That
  // is only sound while render-gl is the sole writer of GL state on the context, which is exactly the
  // integration contract invalidateGlRenderStateCache exists to restore. The guard verifies it; without
  // it the first symptom is a GL error raised against a LATER uniform call, naming render-gl rather
  // than the guest renderer that actually dirtied the binding.
  runtime.bindingCacheGuard?.(state, program);
}

// Resolves and caches EXT_texture_filter_anisotropic on the runtime: anisotropyExt is undefined until
// first queried, then the extension object or null when unsupported, and maxAnisotropy caches the
// hardware cap. Returns null when anisotropic filtering is unavailable.
function ensureGlAnisotropyExt(
  state: GlRenderState,
  runtime: GlRenderStateRuntime,
): EXT_texture_filter_anisotropic | null {
  let ext = runtime.anisotropyExt;
  if (ext === undefined) {
    ext = state.gl.getExtension('EXT_texture_filter_anisotropic');
    runtime.anisotropyExt = ext;
    runtime.maxAnisotropy = ext ? (state.gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number) : 1;
  }
  return ext;
}

// Maps a magnification TextureFilter to its WebGL2 constant. Magnification never samples mips, so the
// mip-variant names collapse to their base LINEAR/NEAREST.
function glMagFilterValue(gl: GlContext, filter: TextureFilter): number {
  return filter.startsWith('nearest') ? gl.NEAREST : gl.LINEAR;
}

// Maps a minification TextureFilter to its WebGL2 constant. When useMips is false (mipmaps disabled or
// a non-mip filter) the mip-variant names collapse to their base LINEAR/NEAREST, so a filter that
// names a mip level never selects an absent chain (which would render the texture black).
function glMinFilterValue(gl: GlContext, filter: TextureFilter, useMips: boolean): number {
  if (!useMips) return filter.startsWith('nearest') ? gl.NEAREST : gl.LINEAR;
  switch (filter) {
    case 'linear-mipmap-linear':
      return gl.LINEAR_MIPMAP_LINEAR;
    case 'linear-mipmap-nearest':
      return gl.LINEAR_MIPMAP_NEAREST;
    case 'nearest-mipmap-linear':
      return gl.NEAREST_MIPMAP_LINEAR;
    case 'nearest-mipmap-nearest':
      return gl.NEAREST_MIPMAP_NEAREST;
    case 'nearest':
      return gl.NEAREST;
    default:
      return gl.LINEAR;
  }
}

// True for the mip-sampling minification filters; the two non-mip modes ('linear'/'nearest') sample
// only the base level and need no mip chain.
function isGlMipmapFilter(filter: TextureFilter): boolean {
  return filter !== 'linear' && filter !== 'nearest';
}

// Maps a sampler wrap mode to its WebGL2 texture-wrap constant; clamp-to-edge is the fallback. REPEAT
// tiles the sampled uv, which is what makes setTextureUvScale / a repeat sampler actually tile.
function glTextureWrapValue(gl: GlContext, wrap: TextureWrap): number {
  if (wrap === 'repeat') return gl.REPEAT;
  if (wrap === 'mirror-repeat') return gl.MIRRORED_REPEAT;
  return gl.CLAMP_TO_EDGE;
}

const NORMAL_BLEND: GlBlendRealization = { src: 'ONE', dst: 'ONE_MINUS_SRC_ALPHA' };

// The built-in blend modes registerDefaultGlBlendModes installs, each with its fixed-function
// realization — the cheap fixed-function set. The Porter-Duff coverage operators (Erase/Alpha/None/…) are
// a CompositeEffect, the destination-reading blends (Overlay/HardLight/…) a BlendEffect, and rare
// equations like Subtract are wired on demand via registerGlBlendMode — none belong in the node-property
// set.
//
// EXACTLY FOUR of the six are correct under partial coverage, and the split is structural rather than a
// tuning gap. Correct compositing is `(1-a)*dst + a*B(src, dst)`; Normal, Add, Multiply and Screen each
// factor into fixed-function terms that reproduce it exactly against a premultiplied source. MIN/MAX do
// not distribute over that lerp, so Darken and Lighten CANNOT be expressed here at any factor choice.
//
// Their failure is not a subtle edge either, now that every source is premultiplied: at zero alpha
// Darken computes min(0, dst) and wipes the backdrop to BLACK, and Lighten is wrong at every
// intermediate alpha (harmless only at zero). This matched 2D's long-standing behaviour before 3D
// adopted the same premultiplied output, so it is consistent rather than new — but it is a visible
// artifact, not an approximation. Realize both as a destination-reading BlendEffect to fix them.
const DEFAULT_GL_BLEND_MODES: readonly (readonly [BlendMode, GlBlendRealization])[] = [
  [BlendMode.Add, { src: 'ONE', dst: 'ONE' }],
  [BlendMode.Darken, { src: 'ONE', dst: 'ONE', equation: 'MIN' }],
  [BlendMode.Lighten, { src: 'ONE', dst: 'ONE', equation: 'MAX' }],
  // Premultiplied multiply: result = src.rgb*dst + dst*(1-src.a). The (1-src.a) term restores the
  // destination where the source is transparent or partially covered (antialiased edges, the quad's
  // transparent surround), so those pixels leave the backdrop untouched instead of multiplying it
  // toward black — the straight-alpha (DST_COLOR, ZERO) form fringes there because this pipeline
  // uploads and shades premultiplied. Exact for an opaque backdrop.
  [BlendMode.Multiply, { src: 'DST_COLOR', dst: 'ONE_MINUS_SRC_ALPHA' }],
  [BlendMode.Normal, NORMAL_BLEND],
  [BlendMode.Screen, { src: 'ONE', dst: 'ONE_MINUS_SRC_COLOR' }],
];
