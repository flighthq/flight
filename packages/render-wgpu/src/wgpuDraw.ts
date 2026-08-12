import { getTextureSource } from '@flighthq/texture/contract';
import type {
  Bitmap,
  ColorScaleBias,
  CompressedImage,
  HasColorScaleBias,
  TextureSource,
  Image,
  Texture,
  TextureColorSpace,
  RenderProxy,
  RenderProxy2D,
  WgpuTextureSourceTextureEntry,
  WgpuRenderState,
  WgpuRenderStateRuntime,
  WgpuTextureEntry,
  WgpuVideoTextureEntry,
} from '@flighthq/types/contract';
import { BlendMode, RegistryEntryState } from '@flighthq/types/contract';

import { retireWgpuTexture } from './wgpuBackground';
import { isWgpuExternalImageSourceReady, tryCopyWgpuExternalImageToTexture } from './wgpuExternalImageSource';
import { generateWgpuMipmaps, getWgpuMipLevelCount } from './wgpuMipmap';
import { getWgpuRenderStateRuntime, getWgpuSampler } from './wgpuRenderState';
import { getActiveWgpuPipeline, getWgpuPipeline, writeWgpuQuadUniforms } from './wgpuShader';

export function applyWgpuBlendMode(state: WgpuRenderState, blendMode: BlendMode | null): void {
  getWgpuRenderStateRuntime(state).currentBlendMode = blendMode;
}

export function bindWgpuBitmapTexture(
  state: WgpuRenderState,
  bitmap: Readonly<Bitmap>,
  generateMips = false,
  premultiply = false,
  colorSpace: TextureColorSpace = 'linear',
): WgpuTextureEntry {
  return bindWgpuTextureSourceTexture(state, bitmap, generateMips, premultiply, colorSpace, uploadWgpuBitmapEntry)!;
}

export function bindWgpuCompressedImageTexture(
  state: WgpuRenderState,
  image: Readonly<CompressedImage>,
  colorSpace: TextureColorSpace = 'linear',
): WgpuTextureEntry | null {
  return bindWgpuTextureSourceTexture(state, image, false, false, colorSpace, uploadWgpuCompressedImageEntry);
}

// Uploads and caches the WebGPU texture for an Image. Bitmap and CompressedImage use sibling
// entry points below; they share only the identity/version cache bracket and keep representation-specific
// uploaders. Premultiplied and straight requests use separate caches so 2D and 3D sampling of one source
// cannot rewrite each other's realization. Returns the texture, view, and 2D bind group.
export function bindWgpuImageResourceTexture(
  state: WgpuRenderState,
  image: Readonly<Image>,
  generateMips = false,
  premultiply = false,
  colorSpace: TextureColorSpace = 'linear',
): WgpuTextureEntry | null {
  return bindWgpuTextureSourceTexture(
    state,
    image,
    generateMips,
    premultiply,
    colorSpace,
    uploadWgpuImageResourceEntry,
  );
}

function bindWgpuTextureSourceTexture(
  state: WgpuRenderState,
  image: Readonly<TextureSource>,
  generateMips: boolean,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
  upload: WgpuTextureSourceUpload,
): WgpuTextureEntry | null {
  const runtime = getWgpuRenderStateRuntime(state);
  const cache = premultiply
    ? colorSpace === 'srgb'
      ? runtime.textureSourcePremultipliedSrgbTextureCache
      : runtime.textureSourcePremultipliedTextureCache
    : colorSpace === 'srgb'
      ? runtime.textureSourceStraightSrgbTextureCache
      : runtime.textureSourceStraightTextureCache;
  const cached = cache.get(image);
  if (cached !== undefined && cached.version === image.version) return cached;

  const built = upload(state, image, generateMips, premultiply, colorSpace);
  if (built === null) return cached ?? null;
  if (cached !== undefined) {
    // RETIRED, NOT DESTROYED. This fires on a payload version bump — the standard invalidation path, not
    // a resize edge case — and it rewrites the cached entry IN PLACE, so a bind group recorded earlier in
    // this frame still points at the outgoing texture. The frame's submit is deferred, and destroying a
    // texture a recorded command buffer references fails that submit and blanks the WHOLE frame.
    retireWgpuTexture(state, cached.texture);
    cached.texture = built.texture;
    cached.view = built.view;
    cached.bindGroup = built.bindGroup;
    // The per-smoothing variants referenced the old view; drop them so they rebuild against the new one.
    cached.bindGroupLinear = undefined;
    cached.bindGroupNearest = undefined;
    cached.straightAlpha = built.straightAlpha;
    cached.version = image.version;
    return cached;
  }
  const entry: WgpuTextureSourceTextureEntry = { ...built, version: image.version };
  cache.set(image, entry);
  return entry;
}

// Uploads (and caches per image source) the GPU texture for an image, returning its texture, full view,
// and a 2D bind group. With generateMips the texture is allocated with a full mip chain and its lower
// levels are rendered via generateWgpuMipmaps — the material path opts in for its trilinear/anisotropic
// samplers; the 2D bitmap path leaves it false for a single-level texture. Because WebGPU fixes
// mipLevelCount at creation and the cache is keyed by source, the first caller decides whether a shared
// image gets a chain; a mip sampler on a chainless texture simply samples the base level.
export function bindWgpuTexture(
  state: WgpuRenderState,
  imageSource: CanvasImageSource,
  generateMips = false,
): WgpuTextureEntry | null {
  const runtime = getWgpuRenderStateRuntime(state);
  const cached = runtime.textureCache.get(imageSource);
  if (cached !== undefined) return cached;

  const { device } = state;
  const { textureBindGroupLayout } = runtime;

  // Determine pixel dimensions from the image source type
  let width = 1;
  let height = 1;
  if (imageSource instanceof HTMLCanvasElement) {
    width = imageSource.width || 1;
    height = imageSource.height || 1;
  } else if (imageSource instanceof HTMLImageElement) {
    width = imageSource.naturalWidth || 1;
    height = imageSource.naturalHeight || 1;
  } else if (imageSource instanceof HTMLVideoElement) {
    width = imageSource.videoWidth || 1;
    height = imageSource.videoHeight || 1;
  } else if (imageSource instanceof ImageBitmap) {
    width = imageSource.width || 1;
    height = imageSource.height || 1;
  } else if (typeof OffscreenCanvas !== 'undefined' && imageSource instanceof OffscreenCanvas) {
    width = imageSource.width || 1;
    height = imageSource.height || 1;
  }

  if (!isWgpuExternalImageSourceReady(imageSource as GPUCopyExternalImageSource, width, height)) return null;

  const mipLevelCount = generateMips ? getWgpuMipLevelCount(width, height) : 1;
  const texture = device.createTexture({
    size: [width, height, 1],
    format: 'rgba8unorm',
    mipLevelCount,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  // Store every uploaded texture premultiplied, matching the premultiplied (ONE, ONE_MINUS_SRC_ALPHA)
  // blend and the shaders, which expect premultiplied input (e.g. the particle shader tints
  // tex.rgb assuming it is already alpha-multiplied). Canvas/OffscreenCanvas are premultiplied
  // internally, so premultipliedAlpha: true is the lossless pass-through; Image/ImageBitmap carry
  // straight alpha and get premultiplied on copy. (A straight-alpha texture under premultiplied
  // blend blows RGB out — it turned the semi-transparent shape panel opaque white.)
  //
  // Deliberately does NOT consult `image.alphaType`, and the asymmetry with scene-gl is not an
  // oversight: `premultipliedAlpha` here DECLARES the destination's encoding and the browser derives
  // whether a conversion is needed from the source it already owns, so an already-premultiplied source
  // cannot be multiplied twice. WebGL's UNPACK_PREMULTIPLY_ALPHA_WEBGL is imperative — it multiplies
  // whatever it is handed — which is why that path guards on the declared alphaType and this one must not.
  const copied = tryCopyWgpuExternalImageToTexture(
    device.queue,
    { source: imageSource as GPUCopyExternalImageSource, flipY: false },
    { texture, premultipliedAlpha: true },
    width,
    height,
  );
  if (!copied) {
    texture.destroy();
    return null;
  }

  // The copy fills level 0 only; render the remaining levels by downsampling (WebGPU has no
  // generateMipmap). Skipped for a single-level texture (mipLevelCount === 1).
  if (mipLevelCount > 1) generateWgpuMipmaps(state, texture, width, height, 'rgba8unorm');

  const view = texture.createView();
  const sampler = state.allowSmoothing ? runtime.linearSampler : runtime.nearestSampler;

  const bindGroup = device.createBindGroup({
    layout: textureBindGroupLayout,
    entries: [
      { binding: 0, resource: view },
      { binding: 1, resource: sampler },
    ],
  });

  const entry: WgpuTextureEntry = { texture, view, bindGroup };
  runtime.textureCache.set(imageSource, entry);
  return entry;
}

function buildWgpuSmoothingBindGroup(
  state: WgpuRenderState,
  runtime: WgpuRenderStateRuntime,
  view: GPUTextureView,
  sampler: GPUSampler,
): GPUBindGroup {
  return state.device.createBindGroup({
    layout: runtime.textureBindGroupLayout,
    entries: [
      { binding: 0, resource: view },
      { binding: 1, resource: sampler },
    ],
  });
}

// Dynamic host-video upload. The texture is cached by Image source and copied only when its
// version advances; a resolution change recreates the allocation/view, and a sampler mutation rebuilds
// only the bind group. Returns null until the source element has a decoded frame.
export function bindWgpuVideoTexture(
  state: WgpuRenderState,
  videoTexture: Readonly<Texture>,
): WgpuVideoTextureEntry | null {
  const image = getTextureSource(videoTexture) as Image | null;
  const element = (image?.source ?? null) as HTMLVideoElement | null;
  if (element === null || element.readyState < 2 || element.videoWidth <= 0 || element.videoHeight <= 0) return null;

  const runtime = getWgpuRenderStateRuntime(state);
  const cache =
    videoTexture.colorSpace === 'srgb'
      ? (runtime.videoSrgbTextureCache ??= new WeakMap())
      : (runtime.videoTextureCache ??= new WeakMap());
  const width = element.videoWidth;
  const height = element.videoHeight;
  const sampler = getWgpuVideoSampler(state, videoTexture);
  let entry = cache.get(image!);
  if (entry === undefined || entry.width !== width || entry.height !== height) {
    entry?.texture.destroy();
    const texture = state.device.createTexture({
      size: [width, height, 1],
      format: videoTexture.colorSpace === 'srgb' ? 'rgba8unorm-srgb' : 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const view = texture.createView();
    entry = {
      bindGroup: buildWgpuTextureBindGroup(state, view, sampler),
      height,
      sampler,
      texture,
      uploadedVersion: -1,
      view,
      width,
    };
    cache.set(image!, entry);
  } else if (entry.sampler !== sampler) {
    entry.sampler = sampler;
    entry.bindGroup = buildWgpuTextureBindGroup(state, entry.view, sampler);
  }

  if (entry.uploadedVersion !== image!.version) {
    const copied = tryCopyWgpuExternalImageToTexture(
      state.device.queue,
      { source: element, flipY: false },
      { texture: entry.texture, premultipliedAlpha: true },
      width,
      height,
    );
    if (!copied) return entry.uploadedVersion < 0 ? null : entry;
    entry.uploadedVersion = image!.version;
  }
  return entry;
}

export function buildWgpuRenderTargetBindGroup(state: WgpuRenderState, view: GPUTextureView): GPUBindGroup {
  const runtime = getWgpuRenderStateRuntime(state);
  const sampler = state.allowSmoothing ? runtime.linearSampler : runtime.nearestSampler;
  return state.device.createBindGroup({
    layout: runtime.textureBindGroupLayout,
    entries: [
      { binding: 0, resource: view },
      { binding: 1, resource: sampler },
    ],
  });
}

export function createWgpuTextureEntry(
  state: WgpuRenderState,
  width: number,
  height: number,
  canvas: HTMLCanvasElement,
): WgpuTextureEntry | null {
  const runtime = getWgpuRenderStateRuntime(state);
  const { device } = state;
  const { textureBindGroupLayout } = runtime;
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  if (!isWgpuExternalImageSourceReady(canvas, w, h)) return null;

  const texture = device.createTexture({
    size: [w, h, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const copied = tryCopyWgpuExternalImageToTexture(
    device.queue,
    { source: canvas as GPUCopyExternalImageSource, flipY: false },
    { texture, premultipliedAlpha: true },
    w,
    h,
  );
  if (!copied) {
    texture.destroy();
    return null;
  }

  const view = texture.createView();
  const sampler = state.allowSmoothing ? runtime.linearSampler : runtime.nearestSampler;

  const bindGroup = device.createBindGroup({
    layout: textureBindGroupLayout,
    entries: [
      { binding: 0, resource: view },
      { binding: 1, resource: sampler },
    ],
  });

  return { texture, view, bindGroup };
}

export function destroyWgpuVideoTexture(state: WgpuRenderState, videoTexture: Readonly<Texture>): boolean {
  const image = getTextureSource(videoTexture) as Image | null;
  if (image == null) return false;
  const runtime = getWgpuRenderStateRuntime(state);
  let destroyed = false;
  for (const cache of [runtime.videoTextureCache, runtime.videoSrgbTextureCache]) {
    const entry = cache?.get(image);
    if (entry === undefined) continue;
    entry.texture.destroy();
    cache!.delete(image);
    destroyed = true;
  }
  return destroyed;
}

function buildWgpuTextureBindGroup(state: WgpuRenderState, view: GPUTextureView, sampler: GPUSampler): GPUBindGroup {
  return state.device.createBindGroup({
    layout: getWgpuRenderStateRuntime(state).textureBindGroupLayout,
    entries: [
      { binding: 0, resource: view },
      { binding: 1, resource: sampler },
    ],
  });
}

function getWgpuVideoSampler(state: WgpuRenderState, videoTexture: Readonly<Texture>): GPUSampler {
  const sampler = videoTexture.sampler;
  const minFilter: GPUFilterMode = sampler.minFilter.startsWith('nearest') ? 'nearest' : 'linear';
  const magFilter: GPUFilterMode = sampler.magFilter.startsWith('nearest') ? 'nearest' : 'linear';
  // A live frame carries base level only; mip-aware filters collapse to their base filter rather than
  // sampling absent levels. Regenerating a full chain for every decoded frame would defeat the video
  // dirty gate.
  return getWgpuSampler(state, minFilter, magFilter, sampler.wrapU, sampler.wrapV, undefined, sampler.anisotropy);
}

export function drawWgpuQuad(
  state: WgpuRenderState,
  renderProxy: RenderProxy2D,
  textureEntry: WgpuTextureEntry,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const pass = runtime.renderPass;
  if (pass === null) return;

  const uniformOffset = writeWgpuQuadUniforms(
    state,
    renderProxy,
    getWgpuRenderProxyColorScaleBias(renderProxy),
    x0,
    y0,
    x1,
    y1,
    u0,
    v0,
    u1,
    v1,
    textureEntry.straightAlpha === true,
  );
  submitWgpuQuadDraw(state, uniformOffset, textureEntry.bindGroup);
}

export function drawWgpuQuadWithTransform(
  state: WgpuRenderState,
  renderProxy: RenderProxy,
  transform: { a: number; b: number; c: number; d: number; tx: number; ty: number },
  textureEntry: WgpuTextureEntry,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const uniformOffset = writeWgpuQuadUniforms(
    state,
    { alpha: renderProxy.alpha, transform2D: transform },
    getWgpuRenderProxyColorScaleBias(renderProxy),
    x0,
    y0,
    x1,
    y1,
    u0,
    v0,
    u1,
    v1,
    textureEntry.straightAlpha === true,
  );
  submitWgpuQuadDraw(state, uniformOffset, textureEntry.bindGroup);
}

export function enableWgpuBlendModeSupport(state: WgpuRenderState): void {
  state.applyBlendMode = applyWgpuBlendMode;
}

// Effective node-level color adjustment for a render node — the resolved HasColorScaleBias trait. Used
// by the immediate (display-object) draw path; the batch path folds it per-instance instead.
export function getWgpuRenderProxyColorScaleBias(renderProxy: Readonly<RenderProxy>): ColorScaleBias | null {
  return (renderProxy as Readonly<Partial<HasColorScaleBias>>).colorScaleBias ?? null;
}

// The group(1) bind group a 2D bitmap should sample through for a per-bitmap `smoothing` preference:
// `null` returns the entry's default bind group (the global `state.allowSmoothing` sampler, for
// sprites/text/shapes); `true`/`false` returns a lazily-built variant over the entry's view bound with the
// LINEAR/NEAREST sampler, so a smoothed and an unsmoothed bitmap sharing one texture each sample with their
// own filter. The variants cache on the entry and are cleared when the texture re-uploads. Mirrors the gl
// `smoothingOverride` on `bindGlImageResourceTexture`.
export function resolveWgpuSmoothingBindGroup(
  state: WgpuRenderState,
  entry: WgpuTextureEntry,
  smoothing: boolean | null,
): GPUBindGroup {
  if (smoothing === null) return entry.bindGroup;
  const runtime = getWgpuRenderStateRuntime(state);
  if (smoothing) {
    return (entry.bindGroupLinear ??= buildWgpuSmoothingBindGroup(state, runtime, entry.view, runtime.linearSampler));
  }
  return (entry.bindGroupNearest ??= buildWgpuSmoothingBindGroup(state, runtime, entry.view, runtime.nearestSampler));
}

export function submitWgpuQuadDraw(
  state: WgpuRenderState,
  uniformOffset: number,
  textureBindGroup: GPUBindGroup,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const pass = runtime.renderPass;
  if (pass === null) return;
  const pipeline = getActiveWgpuPipeline(state);
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, runtime.uniformBindGroup, [uniformOffset]);
  pass.setBindGroup(1, textureBindGroup);
  if (runtime.currentMaskDepth > 0) pass.setStencilReference(runtime.currentMaskDepth);
  pass.draw(6);
}

export function updateWgpuTextureEntry(
  state: WgpuRenderState,
  entry: WgpuTextureEntry,
  canvas: HTMLCanvasElement,
): void {
  const { device } = state;
  const w = Math.max(1, canvas.width);
  const h = Math.max(1, canvas.height);
  if (!isWgpuExternalImageSourceReady(canvas, w, h)) return;

  tryCopyWgpuExternalImageToTexture(
    device.queue,
    { source: canvas, flipY: false },
    { texture: entry.texture, premultipliedAlpha: true },
    w,
    h,
  );
}

// Pre-warm the normal + blend pipelines so the first frame doesn't stall.
export function warmWgpuPipelines(state: WgpuRenderState): void {
  getWgpuPipeline(state, BlendMode.Normal, 'normal');
  getWgpuPipeline(state, BlendMode.Add, 'normal');
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

// Allocates a GPU texture for a Bitmap and writes its CPU-readable pixels, premultiplying a straight
// bitmap only when the caller requests a premultiplied realization.
function uploadWgpuBitmapEntry(
  state: WgpuRenderState,
  image: Readonly<TextureSource>,
  generateMips: boolean,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
): WgpuTextureEntry {
  const bitmap = image as Readonly<Bitmap>;
  const runtime = getWgpuRenderStateRuntime(state);
  const { device } = state;
  const width = bitmap.width || 1;
  const height = bitmap.height || 1;
  const mipLevelCount = generateMips ? getWgpuMipLevelCount(width, height) : 1;
  const format: GPUTextureFormat = colorSpace === 'srgb' ? 'rgba8unorm-srgb' : 'rgba8unorm';
  const texture = device.createTexture({
    size: [width, height, 1],
    format,
    mipLevelCount,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
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
  device.queue.writeTexture({ texture }, data, { bytesPerRow: width * 4, rowsPerImage: height }, [width, height, 1]);
  if (mipLevelCount > 1) generateWgpuMipmaps(state, texture, width, height, format);
  const view = texture.createView();
  const sampler = state.allowSmoothing ? runtime.linearSampler : runtime.nearestSampler;
  const bindGroup = device.createBindGroup({
    layout: runtime.textureBindGroupLayout,
    entries: [
      { binding: 0, resource: view },
      { binding: 1, resource: sampler },
    ],
  });
  return { texture, view, bindGroup };
}

function uploadWgpuCompressedImageEntry(
  state: WgpuRenderState,
  image: Readonly<TextureSource>,
  _generateMips: boolean,
  _premultiply: boolean,
  colorSpace: TextureColorSpace,
): WgpuTextureEntry | null {
  const runtime = getWgpuRenderStateRuntime(state);
  const uploadEntry = runtime.registries.compressedTextureUpload.entry;
  if (uploadEntry?.state !== RegistryEntryState.Bound) return null;
  const decoderEntry = runtime.registries.compressedTextureDecoder.entry;
  return uploadEntry.value(
    state,
    image as Readonly<CompressedImage>,
    decoderEntry?.state === RegistryEntryState.Bound ? decoderEntry.value : null,
    colorSpace,
  );
}

function uploadWgpuImageResourceEntry(
  state: WgpuRenderState,
  image: Readonly<TextureSource>,
  generateMips: boolean,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
): WgpuTextureEntry | null {
  const resource = image as Readonly<Image>;
  const runtime = getWgpuRenderStateRuntime(state);
  const { device } = state;
  const width = resource.width || 1;
  const height = resource.height || 1;
  if (!isWgpuExternalImageSourceReady(resource.source as GPUCopyExternalImageSource, width, height)) return null;
  const mipLevelCount = generateMips ? getWgpuMipLevelCount(width, height) : 1;
  const format: GPUTextureFormat = colorSpace === 'srgb' ? 'rgba8unorm-srgb' : 'rgba8unorm';
  const texture = device.createTexture({
    size: [width, height, 1],
    format,
    mipLevelCount,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const copied = tryCopyWgpuExternalImageToTexture(
    device.queue,
    { source: resource.source as GPUCopyExternalImageSource, flipY: false },
    { texture, premultipliedAlpha: premultiply },
    width,
    height,
  );
  if (!copied) {
    texture.destroy();
    return null;
  }
  if (mipLevelCount > 1) generateWgpuMipmaps(state, texture, width, height, format);
  const view = texture.createView();
  const sampler = state.allowSmoothing ? runtime.linearSampler : runtime.nearestSampler;
  const bindGroup = device.createBindGroup({
    layout: runtime.textureBindGroupLayout,
    entries: [
      { binding: 0, resource: view },
      { binding: 1, resource: sampler },
    ],
  });
  return { texture, view, bindGroup };
}

type WgpuTextureSourceUpload = (
  state: WgpuRenderState,
  image: Readonly<TextureSource>,
  generateMips: boolean,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
) => WgpuTextureEntry | null;
