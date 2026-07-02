import type {
  ColorTransform,
  RenderProxy,
  RenderProxy2D,
  UniformColorTransformMaterial,
  WgpuRenderState,
  WgpuTextureEntry,
} from '@flighthq/types';
import { BlendMode, ColorTransformMaterialKind, UniformColorTransformMaterialKind } from '@flighthq/types';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { getActiveWgpuPipeline, getWgpuPipeline, writeWgpuQuadUniforms } from './wgpuShader';

export function applyWgpuBlendMode(state: WgpuRenderState, blendMode: BlendMode | null): void {
  getWgpuRenderStateRuntime(state).currentBlendMode = blendMode;
}

export function bindWgpuTexture(state: WgpuRenderState, imageSource: CanvasImageSource): WgpuTextureEntry {
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

  const texture = device.createTexture({
    size: [width, height, 1],
    format: 'rgba8unorm',
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

// Effective color transform for a render node from its material — the value on a
// UniformColorTransformMaterial or the per-node materialData for a ColorTransformMaterial. Used by
// the immediate (display-object) draw path; the batch path packs it per-instance instead.
export function getWgpuRenderProxyColorTransform(renderProxy: Readonly<RenderProxy>): ColorTransform | null {
  const material = renderProxy.material;
  if (material === null) return null;
  if (material.kind === UniformColorTransformMaterialKind) {
    return (material as UniformColorTransformMaterial).colorTransform;
  }
  if (material.kind === ColorTransformMaterialKind) {
    return renderProxy.materialData as ColorTransform | null;
  }
  return null;
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
