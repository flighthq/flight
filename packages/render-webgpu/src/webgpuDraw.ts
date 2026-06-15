import { enableRenderFeatures } from '@flighthq/render';
import type { DisplayObjectRenderNode, RenderNode, WebGPURenderState } from '@flighthq/types';
import { BlendMode, RenderFeatures } from '@flighthq/types';

import type { WebGPURenderStateInternal, WebGPUTextureEntry } from './internal';
import { getActivePipeline, getWebGPUPipeline, writeWebGPUQuadUniforms } from './webgpuShader';

export function applyWebGPUBlendMode(state: WebGPURenderState, blendMode: BlendMode | null): void {
  state.currentBlendMode = blendMode;
}

export function bindWebGPUTexture(
  state: WebGPURenderStateInternal,
  imageSource: CanvasImageSource,
): WebGPUTextureEntry {
  const cached = state.textureCache.get(imageSource);
  if (cached !== undefined) return cached;

  const { device, textureBindGroupLayout } = state;

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

  // Canvas2D and OffscreenCanvas store premultiplied data internally — pass it through
  // as-is (premultipliedAlpha: false) to avoid a lossy 8-bit un-premultiply/re-premultiply
  // round-trip. This mirrors WebGL's UNPACK_PREMULTIPLY_ALPHA_WEBGL = false for Canvas
  // sources: "Canvas sources are already premultiplied by the 2D context."
  // Image and ImageBitmap carry straight alpha and need premultipliedAlpha: true.
  const premultipliedAlpha =
    imageSource instanceof HTMLCanvasElement ||
    (typeof OffscreenCanvas !== 'undefined' && imageSource instanceof OffscreenCanvas)
      ? false
      : true;

  device.queue.copyExternalImageToTexture(
    { source: imageSource as GPUCopyExternalImageSource, flipY: false },
    { texture, premultipliedAlpha },
    [width, height],
  );

  const view = texture.createView();
  const sampler = state.allowSmoothing ? state.linearSampler : state.nearestSampler;

  const bindGroup = device.createBindGroup({
    layout: textureBindGroupLayout,
    entries: [
      { binding: 0, resource: view },
      { binding: 1, resource: sampler },
    ],
  });

  const entry: WebGPUTextureEntry = { texture, view, bindGroup };
  state.textureCache.set(imageSource, entry);
  return entry;
}

export function createWebGPUTextureEntry(
  state: WebGPURenderStateInternal,
  width: number,
  height: number,
  canvas: HTMLCanvasElement,
): WebGPUTextureEntry {
  const { device, textureBindGroupLayout } = state;
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
  const sampler = state.allowSmoothing ? state.linearSampler : state.nearestSampler;

  const bindGroup = device.createBindGroup({
    layout: textureBindGroupLayout,
    entries: [
      { binding: 0, resource: view },
      { binding: 1, resource: sampler },
    ],
  });

  return { texture, view, bindGroup };
}

export function drawWebGPUQuad(
  state: WebGPURenderStateInternal,
  renderNode: DisplayObjectRenderNode,
  textureEntry: WebGPUTextureEntry,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): void {
  const pass = state.renderPass;
  if (pass === null) return;

  const uniformOffset = writeWebGPUQuadUniforms(state, renderNode, x0, y0, x1, y1, u0, v0, u1, v1);
  const pipeline = getActivePipeline(state);

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, state.uniformBindGroup, [uniformOffset]);
  pass.setBindGroup(1, textureEntry.bindGroup);
  if (state.currentMaskDepth > 0) {
    pass.setStencilReference(state.currentMaskDepth);
  }
  pass.draw(6);
}

export function drawWebGPUQuadWithTransform(
  state: WebGPURenderStateInternal,
  renderNode: RenderNode,
  transform: { a: number; b: number; c: number; d: number; tx: number; ty: number },
  textureEntry: WebGPUTextureEntry,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): void {
  const pass = state.renderPass;
  if (pass === null) return;

  const byteOffset = state.uniformOffset;
  const floatBase = byteOffset >> 2;
  const { uniformData, uniformDataU32, matrixArray } = state;

  const viewport = state.renderTargetViewport ?? state.canvas;
  const iw = 2 / viewport.width;
  const ih = 2 / viewport.height;
  matrixArray[0] = transform.a * iw;
  matrixArray[1] = -transform.b * ih;
  matrixArray[2] = 0;
  matrixArray[3] = transform.c * iw;
  matrixArray[4] = -transform.d * ih;
  matrixArray[5] = 0;
  matrixArray[6] = transform.tx * iw - 1;
  matrixArray[7] = -transform.ty * ih + 1;
  matrixArray[8] = 1;

  uniformData[floatBase + 0] = matrixArray[0];
  uniformData[floatBase + 1] = matrixArray[1];
  uniformData[floatBase + 2] = matrixArray[2];
  uniformData[floatBase + 3] = 0;
  uniformData[floatBase + 4] = matrixArray[3];
  uniformData[floatBase + 5] = matrixArray[4];
  uniformData[floatBase + 6] = matrixArray[5];
  uniformData[floatBase + 7] = 0;
  uniformData[floatBase + 8] = matrixArray[6];
  uniformData[floatBase + 9] = matrixArray[7];
  uniformData[floatBase + 10] = matrixArray[8];
  uniformData[floatBase + 11] = 0;
  uniformData[floatBase + 12] = renderNode.alpha;
  uniformDataU32[floatBase + 13] = 0;
  uniformData[floatBase + 14] = 0;
  uniformData[floatBase + 15] = 0;
  uniformData[floatBase + 16] = 1;
  uniformData[floatBase + 17] = 1;
  uniformData[floatBase + 18] = 1;
  uniformData[floatBase + 19] = 1;
  uniformData[floatBase + 20] = 0;
  uniformData[floatBase + 21] = 0;
  uniformData[floatBase + 22] = 0;
  uniformData[floatBase + 23] = 0;
  uniformData[floatBase + 24] = x0;
  uniformData[floatBase + 25] = y0;
  uniformData[floatBase + 26] = x1;
  uniformData[floatBase + 27] = y1;
  uniformData[floatBase + 28] = u0;
  uniformData[floatBase + 29] = v0;
  uniformData[floatBase + 30] = u1;
  uniformData[floatBase + 31] = v1;

  state.uniformOffset += state.uniformStride;

  const pipeline = getActivePipeline(state);
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, state.uniformBindGroup, [byteOffset]);
  pass.setBindGroup(1, textureEntry.bindGroup);
  if (state.currentMaskDepth > 0) pass.setStencilReference(state.currentMaskDepth);
  pass.draw(6);
}

export function enableWebGPUBlendModeSupport(state: WebGPURenderState): void {
  state.applyBlendMode = applyWebGPUBlendMode;
  enableRenderFeatures(state, RenderFeatures.BlendMode);
}

export function getOrCreateRenderTargetTextureBindGroup(
  state: WebGPURenderStateInternal,
  view: GPUTextureView,
): GPUBindGroup {
  const sampler = state.allowSmoothing ? state.linearSampler : state.nearestSampler;
  return state.device.createBindGroup({
    layout: state.textureBindGroupLayout,
    entries: [
      { binding: 0, resource: view },
      { binding: 1, resource: sampler },
    ],
  });
}

export function updateWebGPUTextureEntry(
  state: WebGPURenderStateInternal,
  entry: WebGPUTextureEntry,
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
export function warmWebGPUPipelines(state: WebGPURenderStateInternal): void {
  getWebGPUPipeline(state, BlendMode.Normal, 'normal');
  getWebGPUPipeline(state, BlendMode.Add, 'normal');
}
