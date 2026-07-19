import type {
  GlBitmapShader,
  GlBlendRealization,
  GlRenderState,
  GlRenderStateRuntime,
  ImageResource,
  SamplerLike,
  TextureFilter,
  TextureWrap,
  VideoTexture,
} from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { getGlRenderStateRuntime } from './glRenderState';
import { setGlAttributes, setGlMatrixFromValues } from './glShader';
import { uploadGlTextureData, uploadGlTextureElement } from './glTextureUpload';
import { uploadGlTextureVideoFrame } from './glTextureVideoUpload';

// Applies the blend mode's registered fixed-function realization to the GL context, skipping the
// work when the mode is unchanged. A mode with no registered realization (an unregistered vendor
// mode, or a built-in with no fixed-function equivalent such as Overlay) degrades to normal
// premultiplied compositing. Register realizations with registerGlBlendMode /
// registerDefaultGlBlendModes before drawing.
export function applyGlBlendMode(state: GlRenderState, blendMode: BlendMode | null): void {
  const runtime = getGlRenderStateRuntime(state);
  if (blendMode === runtime.currentBlendMode) return;
  runtime.currentBlendMode = blendMode;
  const gl = state.gl;
  const realization = (blendMode !== null ? runtime.glBlendModeRegistry?.get(blendMode) : null) ?? NORMAL_BLEND;
  gl.blendEquation(gl[realization.equation ?? 'FUNC_ADD']);
  gl.blendFunc(gl[realization.src], gl[realization.dst]);
}

// Binds (uploading + caching on first use, re-uploading when the pixels change) the GL texture for an
// ImageResource — a bitmap, sprite atlas, or material map — and applies the sampler's full state. The
// resource-level sibling of bindGlTexture (which takes a raw element): it accepts an element-backed OR a
// data-only generated Surface (source-or-data upload via uploadGlDisplayTexture), and caches by the
// resource entity in imageResourceTextureCache, keyed with the uploaded `version` so an in-place Surface
// edit (which bumps version) re-uploads without the caller tracking it. Sampler state is re-applied every
// bind so a resource reused by two materials with different samplers follows the current draw.
export function bindGlImageResourceTexture(
  state: GlRenderState,
  image: Readonly<ImageResource>,
  sampler?: Readonly<SamplerLike> | null,
): WebGLTexture {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const cache = runtime.imageResourceTextureCache;
  let entry = cache.get(image);
  if (entry === undefined) {
    entry = { texture: gl.createTexture()!, version: -1 };
    cache.set(image, entry);
  }
  gl.bindTexture(gl.TEXTURE_2D, entry.texture);
  runtime.currentTexture = entry.texture;
  if (entry.version !== image.version) {
    uploadGlDisplayTexture(state, image);
    entry.version = image.version;
  }
  applyGlSamplerState(state, runtime, entry.texture, sampler ?? null);
  return entry.texture;
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
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Both image and canvas sources present straight (un-premultiplied) alpha to texImage2D, so
    // premultiply on upload to match the premultiplied (ONE, ONE_MINUS_SRC_ALPHA) blend used
    // everywhere — uploaded images, canvas-backed shapes/text, and render-target composites. (A
    // straight-alpha texture under premultiplied blend blows RGB out to full, turning a 40%-white
    // shape opaque white.) Mirrors updateGlTexture, which already premultiplies canvas uploads.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageSource as TexImageSource);
    textureCache.set(imageSource, texture);
    runtime.currentTexture = texture;
  } else {
    // Always rebind on a cache hit, never skip on runtime.currentTexture. That tracker is the last
    // texture bound to whatever unit was active THEN, but callers change the active unit between binds
    // (a material binds its maps to units 0..4 via gl.activeTexture). Binding one image source to two
    // units — e.g. a map reused as both normal and metallic-roughness — would otherwise leave the
    // second unit unbound. A rebind is one cheap GL call; the sprite batch binds once per batch, so the
    // dropped skip costs nothing meaningful.
    gl.bindTexture(gl.TEXTURE_2D, texture);
    runtime.currentTexture = texture;
  }
  // texture is the active TEXTURE_2D binding in every path above; apply this draw's sampler state here
  // so a cache hit picks it up instead of the first uploader's.
  applyGlSamplerState(state, runtime, texture, sampler ?? null);
  return texture;
}

// Binds the GL texture for a VideoTexture and re-uploads the backing element's current frame only when
// its `frameId` has advanced past the one last uploaded — the dynamic, per-frame sibling of
// bindGlImageResourceTexture (settled ImageResource) and bindGlTexture (raw element). The GL texture is
// cached by the VideoTexture entity in the runtime's videoTextureCache (lazily created), so it persists
// across frames while the frameId dirty-gate keeps a paused or stalled stream from re-uploading. Applies
// the VideoTexture's sampler every bind so a stream shared by two samplers follows the current draw.
// Leaves the texture bound at the active unit for the caller to sample. Callers advance `frameId` via
// advanceVideoTexture when the element reports a fresh decoded frame; this reads the current frame
// through uploadGlTextureElement's zero-copy element fast-path.
export function bindGlVideoTexture(
  state: GlRenderState,
  videoTexture: Readonly<VideoTexture>,
  sampler?: Readonly<SamplerLike> | null,
): WebGLTexture {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const cache = (runtime.videoTextureCache ??= new WeakMap());
  let entry = cache.get(videoTexture);
  if (entry === undefined) {
    entry = { texture: gl.createTexture()!, uploadedFrameId: -1 };
    cache.set(videoTexture, entry);
  }
  gl.bindTexture(gl.TEXTURE_2D, entry.texture);
  runtime.currentTexture = entry.texture;
  // Straight-alpha element under premultiplied blend would blow out RGB; match the bitmap/element path.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  entry.uploadedFrameId = uploadGlTextureVideoFrame(gl, videoTexture, entry.uploadedFrameId);
  applyGlSamplerState(state, runtime, entry.texture, sampler ?? videoTexture.sampler ?? null);
  return entry.texture;
}

export function createGlTexture(state: GlRenderState): WebGLTexture {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const filter = state.allowSmoothing ? gl.LINEAR : gl.NEAREST;
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  runtime.currentTexture = texture;
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
  const { quadVertexData, quadVertexBuffer, quadIndexBuffer, shaderLoc } = runtime;
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
  setGlAttributes(gl, shaderLoc);
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
  return getGlRenderStateRuntime(state).glBlendModeRegistry?.has(blendMode) ?? false;
}

// Registers the built-in fixed-function blend modes on the state. Overlay/HardLight/Difference/Invert
// are intentionally omitted — they have no fixed-function equivalent and need a shader pass — so they
// stay unregistered and fall back to normal compositing.
export function registerDefaultGlBlendModes(state: GlRenderState): void {
  for (const [mode, realization] of DEFAULT_GL_BLEND_MODES) registerGlBlendMode(state, mode, realization);
}

// Binds a fixed-function realization to a blend mode on this render state. Last-write-wins, so a
// caller can override a built-in mode or add a vendor-prefixed one; the registry is created lazily on
// first registration so a state that never enables blend support carries no map.
export function registerGlBlendMode(state: GlRenderState, blendMode: BlendMode, realization: GlBlendRealization): void {
  const runtime = getGlRenderStateRuntime(state);
  (runtime.glBlendModeRegistry ??= new Map()).set(blendMode, realization);
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
    runtime.shaderLoc,
    runtime.matrixArray,
    a,
    b,
    c,
    d,
    tx + a * dx + c * dy,
    ty + b * dx + d * dy,
    runtime.renderTargetViewport ?? state.canvas,
  );
}

export function updateGlTexture(state: GlRenderState, texture: WebGLTexture, canvas: HTMLCanvasElement): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  // Always rebind before uploading — runtime.currentTexture is unit-blind (see bindGlTexture), so a
  // skip could upload into whatever is bound on the currently-active unit instead of `texture`.
  gl.bindTexture(gl.TEXTURE_2D, texture);
  runtime.currentTexture = texture;
  // Browsers pass canvas pixel data to Gl as straight (unmultiplied) alpha.
  // Premultiply on upload so the texture matches the (ONE, ONE_MINUS_SRC_ALPHA) blend mode.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  // Refresh the mip chain if this texture carries one (a canvas/video that opted into mipmaps); the
  // re-uploaded base level would otherwise leave stale lower mips. The 2D default has no chain, so
  // the common per-frame canvas/video upload skips the cost.
  if (runtime.mipmappedTextures?.has(texture)) gl.generateMipmap(gl.TEXTURE_2D);
}

export function useGlProgram(state: GlRenderState, shader?: GlBitmapShader): void {
  const runtime = getGlRenderStateRuntime(state);
  const resolved = shader ?? runtime.defaultBitmapShader;
  runtime.shaderLoc = resolved.locations;
  const program = resolved.program;
  if (runtime.currentProgram !== program) {
    state.gl.useProgram(program);
    runtime.currentProgram = program;
  }
}

// Uploads an ImageResource into the currently-bound texture for the 2D display pipeline. The element
// fast-path premultiplies via UNPACK_PREMULTIPLY_ALPHA_WEBGL (straight-alpha element under a premultiplied
// (ONE, ONE_MINUS_SRC_ALPHA) blend would otherwise blow a 40%-white shape to opaque white). That flag is
// ignored for raw-data (ArrayBufferView) uploads, so straight-alpha `data` is premultiplied on the CPU
// first; opaque data (alpha 255, e.g. a normal/roughness map) premultiplies to itself, so this is a no-op
// there. The data path is what makes a memory-generated Surface a first-class 2D texture. A resource that
// carries only a block-`compressed` payload (no element or data) uploads through the GPU-native compressed
// path — falling back to the state's registered RGBA decoder when the device lacks the block format.
function uploadGlDisplayTexture(state: GlRenderState, image: Readonly<ImageResource>): void {
  const gl = state.gl;
  if (image.source !== null) {
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    uploadGlTextureElement(gl, gl.TEXTURE_2D, image.source as TexImageSource);
    return;
  }
  if (image.data === null && image.compressed !== null) {
    // The compressed-container upload path is an opt-in seam (registerGlCompressedTextureUpload), so a
    // state that only draws element/data bitmaps never carries its ~40-format enum table. When unset,
    // skip rather than upload garbage — the texture stays empty until an uploader is registered.
    const runtime = getGlRenderStateRuntime(state);
    runtime.compressedTextureUpload?.(gl, image, runtime.compressedTextureDecoder ?? null);
    return;
  }
  const data = image.alphaType === 'straight' ? premultiplyStraightRgba8(image.data!) : image.data!;
  uploadGlTextureData(gl, gl.TEXTURE_2D, image.width, image.height, data);
}

// Returns a new premultiplied rgba8 buffer from a straight-alpha one (rgb *= a/255). Allocates, but runs
// only on a texture upload (cache miss or content change), never in the per-frame draw path.
function premultiplyStraightRgba8(data: Readonly<Uint8ClampedArray<ArrayBuffer>>): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    out[i] = (data[i] * a) / 255;
    out[i + 1] = (data[i + 1] * a) / 255;
    out[i + 2] = (data[i + 2] * a) / 255;
    out[i + 3] = a;
  }
  return out;
}

// Applies a sampler's wrap, filtering, anisotropy, and mip chain to the currently-bound TEXTURE_2D.
// Without a sampler it falls back to the state's allowSmoothing flag with clamp-to-edge and no mips —
// the 2D bitmap/sprite default. With one, every field comes from the descriptor. The mip chain is
// generated once per texture (tracked in runtime.mipmappedTextures) the first time a mip-sampling
// filter asks for it, so a shared texture first bound without mips and later with them still generates
// its chain. Filtering and wrap are set every bind (cheap) so a texture shared across samplers follows
// the current draw; only the one-time mip generation is gated.
function applyGlSamplerState(
  state: GlRenderState,
  runtime: GlRenderStateRuntime,
  texture: WebGLTexture,
  sampler: Readonly<SamplerLike> | null,
): void {
  const gl = state.gl;
  if (!sampler) {
    const filter = state.allowSmoothing ? gl.LINEAR : gl.NEAREST;
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
function glMagFilterValue(gl: WebGL2RenderingContext, filter: TextureFilter): number {
  return filter.startsWith('nearest') ? gl.NEAREST : gl.LINEAR;
}

// Maps a minification TextureFilter to its WebGL2 constant. When useMips is false (mipmaps disabled or
// a non-mip filter) the mip-variant names collapse to their base LINEAR/NEAREST, so a filter that
// names a mip level never selects an absent chain (which would render the texture black).
function glMinFilterValue(gl: WebGL2RenderingContext, filter: TextureFilter, useMips: boolean): number {
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
function glTextureWrapValue(gl: WebGL2RenderingContext, wrap: TextureWrap): number {
  if (wrap === 'repeat') return gl.REPEAT;
  if (wrap === 'mirror-repeat') return gl.MIRRORED_REPEAT;
  return gl.CLAMP_TO_EDGE;
}

const NORMAL_BLEND: GlBlendRealization = { src: 'ONE', dst: 'ONE_MINUS_SRC_ALPHA' };

// The built-in blend modes registerDefaultGlBlendModes installs, each with its fixed-function
// realization. Overlay/HardLight/Difference/Invert are deliberately absent — they have no
// fixed-function equivalent and need a shader pass.
const DEFAULT_GL_BLEND_MODES: readonly (readonly [BlendMode, GlBlendRealization])[] = [
  [BlendMode.Add, { src: 'ONE', dst: 'ONE' }],
  [BlendMode.Darken, { src: 'ONE', dst: 'ONE', equation: 'MIN' }],
  [BlendMode.Erase, { src: 'ZERO', dst: 'ONE_MINUS_SRC_ALPHA' }],
  [BlendMode.Lighten, { src: 'ONE', dst: 'ONE', equation: 'MAX' }],
  // Premultiplied multiply: result = src.rgb*dst + dst*(1-src.a). The (1-src.a) term restores the
  // destination where the source is transparent or partially covered (antialiased edges, the quad's
  // transparent surround), so those pixels leave the backdrop untouched instead of multiplying it
  // toward black — the straight-alpha (DST_COLOR, ZERO) form fringes there because this pipeline
  // uploads and shades premultiplied. Exact for an opaque backdrop.
  [BlendMode.Multiply, { src: 'DST_COLOR', dst: 'ONE_MINUS_SRC_ALPHA' }],
  // No blending: result = src (the premultiplied source replaces the destination). For opaque
  // content this matches Normal; unlike Normal it does not composite, so semi-transparent source
  // pixels overwrite the backdrop instead of blending over it.
  [BlendMode.None, { src: 'ONE', dst: 'ZERO' }],
  [BlendMode.Normal, NORMAL_BLEND],
  [BlendMode.Screen, { src: 'ONE', dst: 'ONE_MINUS_SRC_COLOR' }],
  [BlendMode.Subtract, { src: 'ONE', dst: 'ONE', equation: 'FUNC_REVERSE_SUBTRACT' }],
];
