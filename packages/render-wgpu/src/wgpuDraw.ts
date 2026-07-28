import type {
  ColorScaleBias,
  HasColorScaleBias,
  ImageResource,
  Texture,
  RenderProxy,
  RenderProxy2D,
  WgpuImageResourceTextureEntry,
  WgpuRenderState,
  WgpuRenderStateRuntime,
  WgpuTextureEntry,
  WgpuVideoTextureEntry,
} from '@flighthq/types/contract';
import { BlendMode } from '@flighthq/types/contract';

import { generateWgpuMipmaps, getWgpuMipLevelCount } from './wgpuMipmap';
import { getWgpuRenderStateRuntime, getWgpuSampler } from './wgpuRenderState';
import { getActiveWgpuPipeline, getWgpuPipeline, writeWgpuQuadUniforms } from './wgpuShader';

export function applyWgpuBlendMode(state: WgpuRenderState, blendMode: BlendMode | null): void {
  getWgpuRenderStateRuntime(state).currentBlendMode = blendMode;
}

// The resource-level sibling of bindWgpuTexture: uploads and caches the GPU texture for an ImageResource
// — a bitmap, sprite atlas, or material map — accepting an element-backed OR a data-only generated Bitmap.
// Keyed by the resource entity with the uploaded content version, so an in-place Bitmap edit (which bumps
// version) re-uploads (recreating the GPU texture). `premultiply` states whether the caller wants a
// premultiplied GPU texture — bind never premultiplies on its own. The 2D display and particle pipelines
// blend premultiplied (ONE, ONE_MINUS_SRC_ALPHA) and pass true; the 3D forward path blends straight
// (SRC_ALPHA) and reads baseColor.rgb as un-premultiplied albedo, so it leaves the default false. The
// request honors the data's declared alphaType: the premultiply is applied on upload only when the pixels
// are not already premultiplied (an element copies with premultipliedAlpha, straight `data` is
// premultiplied on the CPU since writeTexture does no alpha conversion), so already-premultiplied data
// uploads as-is instead of double-premultiplying. The two request modes cache separate textures
// (imageResourcePremultipliedTextureCache for premultiply, imageResourceStraightTextureCache otherwise), keyed by the
// request so one ImageResource bound both premultiplied (2D) and straight (3D) keeps a correct texture for
// each, and the 2D teardown paths that reach imageResourcePremultipliedTextureCache directly always find theirs there.
// Returns the texture, view, and 2D bind group.
export function bindWgpuImageResourceTexture(
  state: WgpuRenderState,
  image: Readonly<ImageResource>,
  generateMips = false,
  premultiply = false,
): WgpuTextureEntry {
  const runtime = getWgpuRenderStateRuntime(state);
  const cache = premultiply
    ? runtime.imageResourcePremultipliedTextureCache
    : runtime.imageResourceStraightTextureCache;
  const cached = cache.get(image);
  if (cached !== undefined && cached.version === image.version) return cached;

  const built = uploadWgpuImageResourceEntry(
    state,
    image,
    generateMips,
    premultiply && image.alphaType !== 'premultiplied',
  );
  if (cached !== undefined) {
    cached.texture.destroy();
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
  const entry: WgpuImageResourceTextureEntry = { ...built, version: image.version };
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
): WgpuTextureEntry {
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
  device.queue.copyExternalImageToTexture(
    { source: imageSource as GPUCopyExternalImageSource, flipY: false },
    { texture, premultipliedAlpha: true },
    [width, height],
  );

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

// Dynamic host-video upload. The texture is cached by ImageResource backing and copied only when its
// version advances; a resolution change recreates the allocation/view, and a sampler mutation rebuilds
// only the bind group. Returns null until the backing element has a decoded frame.
export function bindWgpuVideoTexture(
  state: WgpuRenderState,
  videoTexture: Readonly<Texture>,
): WgpuVideoTextureEntry | null {
  const image = videoTexture.storage.image;
  const element = (image?.source ?? null) as HTMLVideoElement | null;
  if (element === null || element.readyState < 2 || element.videoWidth <= 0 || element.videoHeight <= 0) return null;

  const runtime = getWgpuRenderStateRuntime(state);
  const cache = (runtime.videoTextureCache ??= new WeakMap());
  const width = element.videoWidth;
  const height = element.videoHeight;
  const sampler = getWgpuVideoSampler(state, videoTexture);
  let entry = cache.get(image!);
  if (entry === undefined || entry.width !== width || entry.height !== height) {
    entry?.texture.destroy();
    const texture = state.device.createTexture({
      size: [width, height, 1],
      format: 'rgba8unorm',
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
    state.device.queue.copyExternalImageToTexture(
      { source: element, flipY: false },
      { texture: entry.texture, premultipliedAlpha: true },
      [width, height],
    );
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
): WgpuTextureEntry {
  const runtime = getWgpuRenderStateRuntime(state);
  const { device } = state;
  const { textureBindGroupLayout } = runtime;
  const w = Math.max(1, width);
  const h = Math.max(1, height);

  const texture = device.createTexture({
    size: [w, h, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  device.queue.copyExternalImageToTexture(
    { source: canvas as GPUCopyExternalImageSource, flipY: false },
    { texture, premultipliedAlpha: true },
    [w, h],
  );

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
  const image = videoTexture.storage.image;
  if (image == null) return false;
  const cache = getWgpuRenderStateRuntime(state).videoTextureCache;
  const entry = cache?.get(image);
  if (entry === undefined) return false;
  entry.texture.destroy();
  cache!.delete(image);
  return true;
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
  const filter: GPUFilterMode = sampler.magFilter.startsWith('nearest') ? 'nearest' : 'linear';
  // A live frame carries base level only; mip-aware filters collapse to their base filter rather than
  // sampling absent levels. Regenerating a full chain for every decoded frame would defeat the video
  // dirty gate.
  return getWgpuSampler(state, filter, sampler.wrapU, sampler.wrapV, undefined, sampler.anisotropy);
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

  device.queue.copyExternalImageToTexture(
    { source: canvas, flipY: false },
    { texture: entry.texture, premultipliedAlpha: true },
    [w, h],
  );
}

// Pre-warm the normal + blend pipelines so the first frame doesn't stall.
export function warmWgpuPipelines(state: WgpuRenderState): void {
  getWgpuPipeline(state, BlendMode.Normal, 'normal');
  getWgpuPipeline(state, BlendMode.Add, 'normal');
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

// Allocates a GPU texture for an ImageResource and uploads its pixels through whichever representation it
// carries — an element via copyExternalImageToTexture or data via writeTexture — then builds the view + 2D
// bind group. `premultiply` is the caller's already alphaType-resolved decision (see
// bindWgpuImageResourceTexture): when set, the element copies with premultipliedAlpha and straight `data`
// is premultiplied on the CPU; when clear, both upload the pixels as-is so the straight-blend 3D path
// keeps its albedo and data maps untouched. The per-upload half of bindWgpuImageResourceTexture, split out
// so the cache/version bracket stays legible.
function uploadWgpuImageResourceEntry(
  state: WgpuRenderState,
  image: Readonly<ImageResource>,
  generateMips: boolean,
  premultiply: boolean,
): WgpuTextureEntry {
  const runtime = getWgpuRenderStateRuntime(state);
  const { device } = state;
  if (image.source === null && image.data === null && image.compressed !== null) {
    const compressed = runtime.compressedTextureUpload?.(state, image, runtime.compressedTextureDecoder ?? null);
    if (compressed != null) return compressed;
  }
  const width = image.width || 1;
  const height = image.height || 1;
  const mipLevelCount = generateMips ? getWgpuMipLevelCount(width, height) : 1;
  const texture = device.createTexture({
    size: [width, height, 1],
    format: 'rgba8unorm',
    mipLevelCount,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  if (image.source !== null) {
    device.queue.copyExternalImageToTexture(
      { source: image.source as GPUCopyExternalImageSource, flipY: false },
      { texture, premultipliedAlpha: premultiply },
      [width, height],
    );
  } else if (image.data !== null) {
    const data = premultiply ? premultiplyStraightRgba8(image.data!) : image.data!;
    device.queue.writeTexture({ texture }, data, { bytesPerRow: width * 4, rowsPerImage: height }, [width, height, 1]);
  }
  if (mipLevelCount > 1) generateWgpuMipmaps(state, texture, width, height, 'rgba8unorm');
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
