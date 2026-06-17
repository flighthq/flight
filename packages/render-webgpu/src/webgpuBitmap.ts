import { noopRendererData } from '@flighthq/render';
import type { Bitmap, DisplayObjectRenderer, RenderProxy2D, RenderState } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { bindWebGPUTexture, drawWebGPUQuad } from './webgpuDraw';
import { resolveWebGPUShader } from './webgpuShaderBinding';

export function drawWebGPUBitmap(state: RenderState, renderProxy: RenderProxy2D): void {
  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;

  const source = renderProxy.source as Bitmap;
  const imageSource = source.data.image;
  if (imageSource === null || imageSource.src === null) return;

  const shader = resolveWebGPUShader(internal, renderProxy);
  internal.applyBlendMode?.(internal, renderProxy.blendMode);

  const textureEntry = bindWebGPUTexture(internal, imageSource.src);

  if (shader !== null) {
    shader.bind(internal, renderProxy);
    return;
  }

  const sr = source.data.sourceRectangle ?? null;
  if (sr === null) {
    drawWebGPUQuad(internal, renderProxy, textureEntry, 0, 0, imageSource.width, imageSource.height, 0, 0, 1, 1);
  } else {
    const u0 = sr.x / imageSource.width;
    const v0 = sr.y / imageSource.height;
    const u1 = (sr.x + sr.width) / imageSource.width;
    const v1 = (sr.y + sr.height) / imageSource.height;
    drawWebGPUQuad(internal, renderProxy, textureEntry, 0, 0, sr.width, sr.height, u0, v0, u1, v1);
  }
}

export function drawWebGPUBitmapMask(state: RenderState, renderProxy: RenderProxy2D): void {
  drawWebGPUBitmap(state, renderProxy);
}

export const defaultWebGPUBitmapRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawWebGPUBitmap,
};
