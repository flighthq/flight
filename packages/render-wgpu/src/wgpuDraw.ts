import type {
  ColorTransform,
  HasColorTransform,
  ImageResource,
  RenderProxy,
  RenderProxy2D,
  WgpuImageResourceTextureEntry,
  WgpuRenderState,
  WgpuTextureEntry,
} from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { generateWgpuMipmaps, getWgpuMipLevelCount } from './wgpuMipmap';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { getActiveWgpuPipeline, getWgpuPipeline, writeWgpuQuadUniforms } from './wgpuShader';

export function applyWgpuBlendMode(state: WgpuRenderState, blendMode: BlendMode | null): void {
  getWgpuRenderStateRuntime(state).currentBlendMode = blendMode;
}

// The resource-level sibling of bindWgpuTexture: uploads and caches the GPU texture for an ImageResource
// — a bitmap, sprite atlas, or material map — accepting an element-backed OR a data-only generated Surface.
// Keyed by the resource entity in imageResourceTextureCache with the uploaded content version, so an
// in-place Surface edit (which bumps version) re-uploads (recreating the GPU texture). Textures are stored
// premultiplied to match the premultiplied (ONE, ONE_MINUS_SRC_ALPHA) blend: an element copies with
// premultipliedAlpha, and straight-alpha `data` is premultiplied on the CPU (writeTexture does no alpha
// conversion). Returns the texture, view, and 2D bind group.
export function bindWgpuImageResourceTexture(
  state: WgpuRenderState,
  image: Readonly<ImageResource>,
  generateMips = false,
): WgpuTextureEntry {
  const cache = getWgpuRenderStateRuntime(state).imageResourceTextureCache;
  const cached = cache.get(image);
  if (cached !== undefined && cached.version === image.version) return cached;

  const built = uploadWgpuImageResourceEntry(state, image, generateMips);
  if (cached !== undefined) {
    cached.texture.destroy();
    cached.texture = built.texture;
    cached.view = built.view;
    cached.bindGroup = built.bindGroup;
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
    getWgpuRenderProxyColorTransform(renderProxy),
    x0,
    y0,
    x1,
    y1,
    u0,
    v0,
    u1,
    v1,
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
    getWgpuRenderProxyColorTransform(renderProxy),
    x0,
    y0,
    x1,
    y1,
    u0,
    v0,
    u1,
    v1,
  );
  submitWgpuQuadDraw(state, uniformOffset, textureEntry.bindGroup);
}

export function enableWgpuBlendModeSupport(state: WgpuRenderState): void {
  state.applyBlendMode = applyWgpuBlendMode;
}

// Effective node-level color transform for a render node — the resolved HasColorTransform trait. Used
// by the immediate (display-object) draw path; the batch path folds it per-instance instead.
export function getWgpuRenderProxyColorTransform(renderProxy: Readonly<RenderProxy>): ColorTransform | null {
  return (renderProxy as Readonly<Partial<HasColorTransform>>).colorTransform ?? null;
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
// carries — an element via copyExternalImageToTexture (premultipliedAlpha) or data via writeTexture (CPU
// premultiply for straight alpha) — then builds the view + 2D bind group. The per-upload half of
// bindWgpuImageResourceTexture, split out so the cache/version bracket stays legible.
function uploadWgpuImageResourceEntry(
  state: WgpuRenderState,
  image: Readonly<ImageResource>,
  generateMips: boolean,
): WgpuTextureEntry {
  const runtime = getWgpuRenderStateRuntime(state);
  const { device } = state;
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
      { texture, premultipliedAlpha: true },
      [width, height],
    );
  } else {
    const data = image.alphaType === 'straight' ? premultiplyStraightRgba8(image.data!) : image.data!;
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
