import type { RenderProxy, RenderProxy2D, WebGPURenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import type { WebGPURenderStateInternal, WebGPUTextureEntry } from './internal';
import { getWebGPURenderProxyColorTransform } from './webgpuColorTransformMaterial';
import { getActiveWebGPUPipeline, getWebGPUPipeline, writeWebGPUQuadUniforms } from './webgpuShader';

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

export function buildWebGPURenderTargetBindGroup(state: WebGPURenderStateInternal, view: GPUTextureView): GPUBindGroup {
  const sampler = state.allowSmoothing ? state.linearSampler : state.nearestSampler;
  return state.device.createBindGroup({
    layout: state.textureBindGroupLayout,
    entries: [
      { binding: 0, resource: view },
      { binding: 1, resource: sampler },
    ],
  });
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
  renderProxy: RenderProxy2D,
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

  const uniformOffset = writeWebGPUQuadUniforms(
    state,
    renderProxy,
    getWebGPURenderProxyColorTransform(renderProxy),
    x0,
    y0,
    x1,
    y1,
    u0,
    v0,
    u1,
    v1,
  );
  const pipeline = getActiveWebGPUPipeline(state);

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
  renderProxy: RenderProxy,
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
  uniformData[floatBase + 12] = renderProxy.alpha;
  const ct = getWebGPURenderProxyColorTransform(renderProxy);
  uniformDataU32[floatBase + 13] = ct !== null ? 1 : 0;
  uniformData[floatBase + 14] = 0;
  uniformData[floatBase + 15] = 0;
  uniformData[floatBase + 16] = ct?.redMultiplier ?? 1;
  uniformData[floatBase + 17] = ct?.greenMultiplier ?? 1;
  uniformData[floatBase + 18] = ct?.blueMultiplier ?? 1;
  uniformData[floatBase + 19] = ct?.alphaMultiplier ?? 1;
  uniformData[floatBase + 20] = (ct?.redOffset ?? 0) / 255;
  uniformData[floatBase + 21] = (ct?.greenOffset ?? 0) / 255;
  uniformData[floatBase + 22] = (ct?.blueOffset ?? 0) / 255;
  uniformData[floatBase + 23] = (ct?.alphaOffset ?? 0) / 255;
  uniformData[floatBase + 24] = x0;
  uniformData[floatBase + 25] = y0;
  uniformData[floatBase + 26] = x1;
  uniformData[floatBase + 27] = y1;
  uniformData[floatBase + 28] = u0;
  uniformData[floatBase + 29] = v0;
  uniformData[floatBase + 30] = u1;
  uniformData[floatBase + 31] = v1;

  state.uniformOffset += state.uniformStride;

  const pipeline = getActiveWebGPUPipeline(state);
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, state.uniformBindGroup, [byteOffset]);
  pass.setBindGroup(1, textureEntry.bindGroup);
  if (state.currentMaskDepth > 0) pass.setStencilReference(state.currentMaskDepth);
  pass.draw(6);
}

export function enableWebGPUBlendModeSupport(state: WebGPURenderState): void {
  state.applyBlendMode = applyWebGPUBlendMode;
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
