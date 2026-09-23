import { computeRgbaCssString } from '@flighthq/color/contract';
import { invalidateImageResource } from '@flighthq/image/contract';
import { getNodeLocalContentRevision } from '@flighthq/node/contract';
import { bindWgpuImageResourceTexture, resolveWgpuQuadMaterialRenderer } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createCanvasHostSurface, destroyCanvasHostSurface } from '@flighthq/render/contract';
import { computeTextFormatFontString } from '@flighthq/text/contract';
import { getTextLabelRuntime } from '@flighthq/text/contract';
import { computeTextLayout, createTextFormatRange, getTextLayoutResult } from '@flighthq/textlayout/contract';
import type {
  CanvasSurface,
  HostCanvasCapability,
  HostImageCapability,
  ImageResource,
  NodeAny,
  RendererData,
  RenderProxy2D,
  RenderState,
  Scene2DRenderer,
  TextFormat,
  TextLabel,
  TextLabelRuntime,
  WgpuRenderState,
} from '@flighthq/types/contract';
import { BatchFormat } from '@flighthq/types/contract';

import {
  QUAD_BATCH_INSTANCE_FLOATS,
  ensureWgpuQuadBatchResources,
  packWgpuQuadBatchMaterialInstance,
  prepareWgpuQuadBatchWrite,
  recordWgpuQuadBatchColorScaleBias,
  writeWgpuQuadBatchInstance,
} from './wgpuQuadBatchWriter';
import { createWgpuRendererData, getWgpuRendererData } from './wgpuRendererData';

interface WgpuTextLabelData extends RendererData {
  image: ImageResource | null;
  lastContentId: number;
  lastPixelRatio: number;
  logH: number;
  logW: number;
  surface: CanvasSurface | null;
}

function createWgpuTextLabelData(_state: RenderState, _source: NodeAny): RendererData {
  return createWgpuRendererData({
    image: null,
    lastContentId: -1,
    lastPixelRatio: 0,
    logH: 0,
    logW: 0,
    surface: null,
  });
}

function destroyWgpuTextLabelData(state: WgpuRenderState, data: RendererData): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const textLabelData = getWgpuRendererData<WgpuTextLabelData>(data);
  if (textLabelData === null) return;
  const { image, surface } = textLabelData;
  if (image !== null) {
    const entry = runtime.context.textureSourcePremultipliedTextureCache.get(image);
    if (entry !== undefined) {
      entry.texture.destroy();
      runtime.context.textureSourcePremultipliedTextureCache.delete(image);
    }
  }
  if (surface !== null) destroyCanvasHostSurface(surface);
}

export function drawWgpuTextLabel(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = renderProxy.source as TextLabel;
  const { text, textFormat, width: fieldWidth, height: fieldHeight } = source.data;
  if (text.length === 0) return;
  if (renderProxy.rendererData === null) return;

  const material = renderProxy.material;
  const materialRenderer = resolveWgpuQuadMaterialRenderer(state, material);
  if (materialRenderer === null) return;

  if (state.canvasHost === null || state.imageHost === null) return;
  const textData = getWgpuRendererData<WgpuTextLabelData>(renderProxy.rendererData);
  if (textData === null) return;
  const surface = acquireWgpuTextLabelRasterSurface(state.canvasHost, state.imageHost, textData);
  if (surface === null) return;
  const maxTexDim = state.device.limits.maxTextureDimension2D;
  const pixelRatio = state.pixelRatio;
  const version = getNodeLocalContentRevision(source);

  if (version !== textData.lastContentId || pixelRatio !== textData.lastPixelRatio) {
    const measure = (t: string, format: TextFormat): number => {
      surface.context.font = computeTextFormatFontString(format);
      return surface.context.measureText(t).width;
    };

    const result = getTextLayoutResult(getTextLabelRuntime(source) as TextLabelRuntime);
    computeTextLayout(result, {
      text,
      formatRanges: [createTextFormatRange(textFormat, 0, text.length)],
      width: fieldWidth,
      height: fieldHeight,
      measure,
      verticalAlign: source.data.autoSize === 'none' ? source.data.verticalAlign : 'top',
    });

    textData.lastContentId = version;
    textData.lastPixelRatio = pixelRatio;
    textData.logW = 0;
    textData.logH = 0;

    if (result.groups.length === 0) return;

    let maxX = 0;
    let maxY = 0;
    for (const group of result.groups) {
      const right = group.offsetX + group.width;
      const bottom = group.offsetY + group.ascent + group.descent;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    }

    const maxLogical = Math.floor(maxTexDim / pixelRatio);
    const w = Math.min(Math.ceil(maxX), maxLogical);
    const h = Math.min(Math.ceil(maxY), maxLogical);
    if (w <= 0 || h <= 0) return;

    const pw = Math.ceil(w * pixelRatio);
    const ph = Math.ceil(h * pixelRatio);
    surface.width = pw;
    surface.height = ph;

    const ctx = surface.context;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'start';

    for (const group of result.groups) {
      ctx.font = computeTextFormatFontString(group.format);
      ctx.fillStyle = computeRgbaCssString(group.format.color ?? 0x000000ff);
      const slice = text.substring(group.startIndex, group.endIndex);
      ctx.fillText(slice, group.offsetX, group.offsetY + group.ascent * 0.815);
    }

    if (textData.image !== null) invalidateImageResource(textData.image);

    textData.logW = w;
    textData.logH = h;
  }

  if (textData.logW <= 0 || textData.logH <= 0) return;

  ensureWgpuQuadBatchResources(state);

  if (textData.image === null) return;
  const textureEntry = bindWgpuImageResourceTexture(state, textData.image, false, true);
  if (textureEntry === null) return;
  const startInstance = prepareWgpuQuadBatchWrite(
    state,
    textureEntry,
    null,
    renderProxy.blendMode,
    material,
    materialRenderer,
    1,
  );
  const base = startInstance * QUAD_BATCH_INSTANCE_FLOATS;
  const d = runtime.quadBatchWriterInstanceData;
  const t = renderProxy.transform2D;
  writeWgpuQuadBatchInstance(d, base, t, textData.logW, textData.logH, 0, 0, 1, 1, renderProxy.alpha);
  packWgpuQuadBatchMaterialInstance(state, renderProxy.materialData, startInstance);
  recordWgpuQuadBatchColorScaleBias(state, renderProxy.colorMatrix ?? renderProxy.colorScaleBias, startInstance);
  runtime.quadBatchWriterCount++;
}

export const wgpuTextLabelRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad,
  createData: createWgpuTextLabelData,
  destroyData: destroyWgpuTextLabelData,
  submit: drawWgpuTextLabel,
};

function acquireWgpuTextLabelRasterSurface(
  canvasHost: Readonly<HostCanvasCapability>,
  imageHost: Readonly<HostImageCapability>,
  data: WgpuTextLabelData,
): CanvasSurface | null {
  if (data.surface !== null) return data.surface;
  const surface = createCanvasHostSurface(canvasHost, 1, 1);
  if (surface === null) return null;
  data.surface = surface;
  data.image = imageHost.createImageFromSurface?.(surface) ?? null;
  return surface;
}
