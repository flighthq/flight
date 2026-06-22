import { drawWgpuQuad } from '@flighthq/render-wgpu';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  DisplayObjectRenderer,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  Video,
  WgpuRenderState,
  WgpuTextureEntry,
} from '@flighthq/types';

import { flushWgpuSpriteBatch } from './webgpuSpriteBatch';

// Per-node GPU texture entry the current video frame is uploaded into. Held on the node's
// RendererData (not a module-level map keyed by render proxy) so destroyWgpuVideoData can free it.
interface WgpuVideoData {
  entry: WgpuTextureEntry | null;
  w: number;
  h: number;
}

export function createWgpuVideoData(_state: RenderState, _source: Renderable): RendererData {
  return { entry: null, h: 0, w: 0 } as unknown as RendererData;
}

// Destroys the GPU texture this video node owns when it is torn down via disposeDisplayObjectRender.
export function destroyWgpuVideoData(_state: RenderState, data: RendererData): void {
  const videoData = data as unknown as WgpuVideoData;
  videoData.entry?.texture.destroy();
}

export function drawWgpuVideo(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;
  flushWgpuSpriteBatch(state);

  const source = renderProxy.source as Video;
  const element = source.data.source?.element;
  if (element === undefined || element === null || element.readyState < 2) return;

  const vw = element.videoWidth;
  const vh = element.videoHeight;
  if (vw === 0 || vh === 0) return;

  state.applyBlendMode?.(state, renderProxy.blendMode);

  if (renderProxy.rendererData === null) return;
  const videoData = renderProxy.rendererData as unknown as WgpuVideoData;
  let entry = videoData.entry;
  if (entry === null || videoData.w !== vw || videoData.h !== vh) {
    entry?.texture.destroy();
    const device = state.device;
    const { textureBindGroupLayout, linearSampler } = runtime;
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
    entry = { bindGroup, texture, view };
    videoData.entry = entry;
    videoData.w = vw;
    videoData.h = vh;
  }

  state.device.queue.copyExternalImageToTexture(
    { source: element, flipY: false },
    { premultipliedAlpha: false, texture: entry.texture },
    [vw, vh],
  );

  drawWgpuQuad(state, renderProxy, entry, 0, 0, vw, vh, 0, 0, 1, 1);
}

export const defaultWgpuVideoRenderer: DisplayObjectRenderer = {
  createData: createWgpuVideoData,
  destroyData: destroyWgpuVideoData,
  submit: drawWgpuVideo,
};
