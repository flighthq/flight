import { noopRendererData } from '@flighthq/render';
import type { DisplayObjectRenderer, RenderNode2D, RenderState, Video } from '@flighthq/types';

import type { WebGPURenderStateInternal, WebGPUTextureEntry } from './internal';
import { drawWebGPUQuad } from './webgpuDraw';

interface WebGPUVideoData {
  entry: WebGPUTextureEntry;
  w: number;
  h: number;
}

const _videoMap = new WeakMap<RenderNode2D, WebGPUVideoData>();

export function drawWebGPUVideo(state: RenderState, renderNode: RenderNode2D): void {
  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;

  const source = renderNode.source as Video;
  const element = source.data.source?.element;
  if (element === undefined || element === null || element.readyState < 2) return;

  const vw = element.videoWidth;
  const vh = element.videoHeight;
  if (vw === 0 || vh === 0) return;

  internal.applyBlendMode?.(internal, renderNode.blendMode);

  let videoData = _videoMap.get(renderNode);
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
    _videoMap.set(renderNode, videoData);
  }

  internal.device.queue.copyExternalImageToTexture(
    { source: element, flipY: false },
    { premultipliedAlpha: false, texture: videoData.entry.texture },
    [vw, vh],
  );

  drawWebGPUQuad(internal, renderNode, videoData.entry, 0, 0, vw, vh, 0, 0, 1, 1);
}

export function drawWebGPUVideoMask(state: RenderState, renderNode: RenderNode2D): void {
  drawWebGPUVideo(state, renderNode);
}

export const defaultWebGPUVideoRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawWebGPUVideo,
};
