import { createEntity } from '@flighthq/entity/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type {
  Bitmap,
  ColorScaleBias,
  CompressedImageResource,
  HasColorScaleBias,
  TextureSource,
  ImageResource,
  Texture,
  TextureColorSpace,
  RenderProxy,
  RenderProxy2D,
  WgpuTextureSourceTextureEntry,
  WgpuRenderState,
  WgpuTextureEntry,
  WgpuVideoTextureEntry,
} from '@flighthq/types/contract';
import { BlendMode, RegistryEntryState } from '@flighthq/types/contract';

import { retireWgpuTexture } from './wgpuBackground';
import { isWgpuExternalImageSourceReady, tryCopyWgpuExternalImageToTexture } from './wgpuExternalImageSource';
import { getWgpuRenderStateDeviceResources, getWgpuRenderStateRuntime, getWgpuSampler } from './wgpuRenderState';
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
  image: Readonly<CompressedImageResource>,
  colorSpace: TextureColorSpace = 'linear',
): WgpuTextureEntry | null {
  return bindWgpuTextureSourceTexture(state, image, false, false, colorSpace, uploadWgpuCompressedImageEntry);
}

// Uploads and caches the WebGPU texture for an ImageResource. Bitmap and CompressedImageResource use sibling
// entry points below; they share only the identity/version cache bracket and keep representation-specific
// uploaders. Premultiplied and straight requests use separate caches so 2D and 3D sampling of one source
// cannot rewrite each other's realization. Returns the texture, view, and 2D bind group.
export function bindWgpuImageResourceTexture(
  state: WgpuRenderState,
  image: Readonly<ImageResource>,
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
      ? runtime.context.textureSourcePremultipliedSrgbTextureCache
      : runtime.context.textureSourcePremultipliedTextureCache
    : colorSpace === 'srgb'
      ? runtime.context.textureSourceStraightSrgbTextureCache
      : runtime.context.textureSourceStraightTextureCache;
  const cached = cache.get(image);
  // Mip allocation is part of the identity, not a sampling preference. WebGPU fixes mipLevelCount at
  // creation, so a cached level-0-only realization cannot serve a request that needs a chain however it
  // is sampled — without this arm the FIRST caller's `generateMips` silently decided for every later
  // sharer of the source, and a minified draw sampled a texture that has no lower levels.
  const wantsMips = generateMips && getWgpuRenderStateRuntime(state).mipmapGenerator != null;
  if (cached !== undefined && cached.version === image.version && cached.mipLevelCount > 1 === wantsMips) {
    return cached;
  }

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
    cached.mipLevelCount = built.mipLevelCount;
    // Every cached bind group referenced the old view; drop them all so they rebuild against the new one.
    cached.bindings.clear();
    cached.straightAlpha = built.straightAlpha;
    cached.version = image.version;
    return cached;
  }
  const entry: WgpuTextureSourceTextureEntry = { ...built, version: image.version };
  cache.set(image, entry);
  return entry;
}

// Uploads (and caches per raw element) the GPU texture for an image source, returning the allocated
// resource. With generateMips the texture is allocated with a full mip chain whose lower levels are
// rendered via runtime.mipmapGenerator (installed by registerWgpuMipmapGeneration); left false it is a
// single-level texture. Passing true without registering leaves the extra levels uninitialized, which
// runtime.mipmapDegradedGuard reports.
//
// Mip allocation is part of this cache's identity too, for the same reason as the TextureSource caches:
// WebGPU fixes mipLevelCount at creation, so a cached level-0-only realization cannot serve a request
// that needs a chain. Nothing in-tree passes generateMips through here today (resolveWgpuTexture does not
// expose it), but a cache that is only correct while a parameter goes unused is a trap, not an invariant.
export function bindWgpuTexture(
  state: WgpuRenderState,
  imageSource: CanvasImageSource,
  generateMips = false,
): WgpuTextureEntry | null {
  const runtime = getWgpuRenderStateRuntime(state);
  const cached = runtime.context.textureCache.get(imageSource);
  const wantsMips = generateMips && runtime.mipmapGenerator != null;
  if (cached !== undefined && cached.mipLevelCount > 1 === wantsMips) return cached;

  const { device } = state;

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

  if (generateMips && runtime.mipmapGenerator == null) runtime.mipmapDegradedGuard?.(state);
  const mipLevelCount = generateMips && runtime.mipmapGenerator != null ? wgpuMipLevelCount(width, height) : 1;
  const texture = device.createTexture({
    size: [width, height, 1],
    format: 'rgba8unorm',
    mipLevelCount,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  // Store every uploaded texture premultiplied, matching the premultiplied (ONE, ONE_MINUS_SRC_ALPHA)
  // blend and the shaders, which expect premultiplied input (e.g. the particle shader tints
  // tex.rgb assuming it is already alpha-multiplied). Canvas/OffscreenCanvas are premultiplied
  // internally, so premultipliedAlpha: true is the lossless pass-through; ImageResource/ImageBitmap carry
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
  if (mipLevelCount > 1) runtime.mipmapGenerator?.(state, texture, width, height, 'rgba8unorm');

  const view = texture.createView();

  // No bind group is built here on purpose. Binding a sampler at upload time would capture whatever
  // `state.allowSmoothing` happened to be for the FIRST caller into an entry every later sharer reuses;
  // the sampler is chosen per draw instead, in resolveWgpuSmoothingBindGroup.
  const entry: WgpuTextureEntry = createEntity({ bindings: new Map(), mipLevelCount, texture, view });
  runtime.context.textureCache.set(imageSource, entry);
  return entry;
}

// The sampler the state's CURRENT draw policy selects. Read per draw and never stored on a resource:
// `allowSmoothing` is mutable and shared, so a value captured at upload time goes stale silently.
function getWgpuDrawPolicySampler(state: WgpuRenderState): GPUSampler {
  const resources = getWgpuRenderStateDeviceResources(state);
  return state.allowSmoothing ? resources.linearSampler : resources.nearestSampler;
}

// The group(1) bind group for this entry's view sampled with `sampler`, built once per sampler and
// memoized on the entry. Every bind group over a cached texture goes through here, so no draw policy
// can reach a resource's identity.
function resolveWgpuTextureBinding(state: WgpuRenderState, entry: WgpuTextureEntry, sampler: GPUSampler): GPUBindGroup {
  const cached = entry.bindings.get(sampler);
  if (cached !== undefined) return cached;
  const bindGroup = buildWgpuTextureBindGroup(state, entry.view, sampler);
  entry.bindings.set(sampler, bindGroup);
  return bindGroup;
}

// Dynamic host-video upload. The texture is cached by ImageResource source and copied only when its
// version advances; a resolution change recreates the allocation/view, and a sampler mutation rebuilds
// only the bind group. Returns null until the source element has a decoded frame.
export function bindWgpuVideoTexture(
  state: WgpuRenderState,
  videoTexture: Readonly<Texture>,
): WgpuVideoTextureEntry | null {
  const image = getTextureSource(videoTexture) as ImageResource | null;
  const element = (image?.source ?? null) as HTMLVideoElement | null;
  if (element === null || element.readyState < 2 || element.videoWidth <= 0 || element.videoHeight <= 0) return null;

  const runtime = getWgpuRenderStateRuntime(state);
  const cache =
    videoTexture.colorSpace === 'srgb'
      ? (runtime.context.videoSrgbTextureCache ??= new WeakMap())
      : (runtime.context.videoTextureCache ??= new WeakMap());
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
    entry = createEntity({
      bindings: new Map(),
      height,
      mipLevelCount: 1,
      sampler,
      texture,
      uploadedVersion: -1,
      view,
      width,
    });
    cache.set(image!, entry);
  } else if (entry.sampler !== sampler) {
    // Video carries its own resolved sampler rather than following the global policy, so record the
    // change; the bind group for it is resolved on demand from the shared per-sampler cache.
    entry.sampler = sampler;
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

export function createWgpuTextureEntry(
  state: WgpuRenderState,
  width: number,
  height: number,
  canvas: HTMLCanvasElement,
): WgpuTextureEntry | null {
  const { device } = state;
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

  return createEntity({ bindings: new Map(), mipLevelCount: 1, texture, view });
}

export function destroyWgpuVideoTexture(state: WgpuRenderState, videoTexture: Readonly<Texture>): boolean {
  const image = getTextureSource(videoTexture) as ImageResource | null;
  if (image == null) return false;
  const runtime = getWgpuRenderStateRuntime(state);
  let destroyed = false;
  for (const cache of [runtime.context.videoTextureCache, runtime.context.videoSrgbTextureCache]) {
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
    layout: getWgpuRenderStateDeviceResources(state).textureBindGroupLayout,
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
  submitWgpuQuadDraw(state, uniformOffset, resolveWgpuSmoothingBindGroup(state, textureEntry, null));
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
  submitWgpuQuadDraw(state, uniformOffset, resolveWgpuSmoothingBindGroup(state, textureEntry, null));
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
// `null` follows the state's current `allowSmoothing` policy (sprites/text/shapes), `true`/`false`
// overrides it with the LINEAR/NEAREST sampler, so a smoothed and an unsmoothed bitmap sharing one
// texture each sample with their own filter. All three arms resolve through the same per-sampler
// binding cache. Mirrors the gl `smoothingOverride` on `bindGlImageResourceTexture`.
//
// The `null` arm re-reads the policy on every call rather than returning a group captured at upload:
// `allowSmoothing` is mutable and the entry is shared, so a captured group let whichever caller
// realized the texture first decide how everyone else sampled it.
export function resolveWgpuSmoothingBindGroup(
  state: WgpuRenderState,
  entry: WgpuTextureEntry,
  smoothing: boolean | null,
): GPUBindGroup {
  const resources = getWgpuRenderStateDeviceResources(state);
  const sampler =
    smoothing === null
      ? (entry.sampler ?? getWgpuDrawPolicySampler(state))
      : smoothing
        ? resources.linearSampler
        : resources.nearestSampler;
  return resolveWgpuTextureBinding(state, entry, sampler);
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
  if (generateMips && runtime.mipmapGenerator == null) runtime.mipmapDegradedGuard?.(state);
  const mipLevelCount = generateMips && runtime.mipmapGenerator != null ? wgpuMipLevelCount(width, height) : 1;
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
  if (mipLevelCount > 1) runtime.mipmapGenerator?.(state, texture, width, height, format);
  const view = texture.createView();
  return createEntity({ bindings: new Map(), mipLevelCount, texture, view });
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
    image as Readonly<CompressedImageResource>,
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
  const resource = image as Readonly<ImageResource>;
  const runtime = getWgpuRenderStateRuntime(state);
  const { device } = state;
  const width = resource.width || 1;
  const height = resource.height || 1;
  if (!isWgpuExternalImageSourceReady(resource.source as GPUCopyExternalImageSource, width, height)) return null;
  if (generateMips && runtime.mipmapGenerator == null) runtime.mipmapDegradedGuard?.(state);
  const mipLevelCount = generateMips && runtime.mipmapGenerator != null ? wgpuMipLevelCount(width, height) : 1;
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
  if (mipLevelCount > 1) runtime.mipmapGenerator?.(state, texture, width, height, format);
  const view = texture.createView();
  return createEntity({ bindings: new Map(), mipLevelCount, texture, view });
}

type WgpuTextureSourceUpload = (
  state: WgpuRenderState,
  image: Readonly<TextureSource>,
  generateMips: boolean,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
) => WgpuTextureEntry | null;

function wgpuMipLevelCount(width: number, height: number): number {
  return 1 + Math.floor(Math.log2(Math.max(1, width, height)));
}
