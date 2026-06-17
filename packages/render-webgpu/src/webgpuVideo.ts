import { noopRendererData } from '@flighthq/render';
import type { DisplayObjectRenderer, RenderProxy2D, RenderState, Video } from '@flighthq/types';

import type { WebGPURenderStateInternal, WebGPUTextureEntry } from './internal';
import { drawWebGPUQuad } from './webgpuDraw';
import { flushWebGPUSpriteBatch } from './webgpuSpriteBatch';

interface WebGPUVideoData {
  entry: WebGPUTextureEntry;
  w: number;
  h: number;
}

const _videoMap = new WeakMap<RenderProxy2D, WebGPUVideoData>();

export function drawWebGPUVideo(state: RenderState, renderProxy: RenderProxy2D): void {
  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;
  flushWebGPUSpriteBatch(internal);

  const source = renderProxy.source as Video;
  const element = source.data.source?.element;
  if (element === undefined || element === null || element.readyState < 2) return;

  const vw = element.videoWidth;
  const vh = element.videoHeight;
  if (vw === 0 || vh === 0) return;

  internal.applyBlendMode?.(internal, renderProxy.blendMode);

  let videoData = _videoMap.get(renderProxy);
  if (!videoData || videoData.w !== vw || videoData.h !== vh) {
    videoData?.entry.texture.destroy();
    const { device, textureBindGroupLayout, linearSampler } = internal;
    const texture = device.createTexture({
      format: 'rgba8unorm',
      size: [vw, vh, 1],
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    const view = texture.createView();
    const bindGroup = device.createBindGroup({
      entries: [
        { binding: 0, resource: view },
        { binding: 1, resource: linearSampler },
      ],
      layout: textureBindGroupLayout,
    });
    videoData = { entry: { bindGroup, texture, view }, h: vh, w: vw };
    _videoMap.set(renderProxy, videoData);
  }

  internal.device.queue.copyExternalImageToTexture(
    { source: element, flipY: false },
    { premultipliedAlpha: false, texture: videoData.entry.texture },
    [vw, vh],
  );

  drawWebGPUQuad(internal, renderProxy, videoData.entry, 0, 0, vw, vh, 0, 0, 1, 1);
}

export function drawWebGPUVideoMask(state: RenderState, renderProxy: RenderProxy2D): void {
  drawWebGPUVideo(state, renderProxy);
}

export const defaultWebGPUVideoRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawWebGPUVideo,
};
