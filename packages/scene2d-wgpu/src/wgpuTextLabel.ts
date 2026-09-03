import { computeRgbaCssString } from '@flighthq/color/contract';
import { invalidateImageResource } from '@flighthq/image/contract';
import { getNodeLocalContentRevision } from '@flighthq/node/contract';
import { bindWgpuImageResourceTexture, resolveWgpuMaterialRenderer } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createRaster2DSurface, destroyRaster2DSurface } from '@flighthq/render/contract';
import { computeTextFormatFontString } from '@flighthq/text/contract';
import { getTextLabelRuntime } from '@flighthq/text/contract';
import { computeTextLayout, createTextFormatRange, getTextLayoutResult } from '@flighthq/textlayout/contract';
import type {
  Scene2DRenderer,
  Raster2DSurface,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  TextFormat,
  TextLabel,
  TextLabelRuntime,
  WgpuRenderState,
} from '@flighthq/types/contract';
import { BatchFormat } from '@flighthq/types/contract';

import {
  ensureWgpuQuadBatchResources,
  packWgpuQuadBatchMaterialInstance,
  prepareWgpuQuadBatchWrite,
  recordWgpuQuadBatchColorScaleBias,
} from './wgpuQuadBatchWriter';
import { createWgpuRendererData, getWgpuRendererData } from './wgpuRendererData';

interface WgpuTextLabelData extends RendererData {
  // Allocated on first draw so a node created before its host provider is enabled can recover. Once
  // acquired, the surface and its uploadable Image identity remain stable for the node's lifetime.
  surface: Raster2DSurface | null;
  // Content revision and pixel ratio at last rasterization. Re-rasterization is driven by the
  // upstream TextLabel content version (bumped by TextLabel setters on layout-affecting changes), never by
  // appearance-only changes such as alpha.
  lastContentId: number;
  lastPixelRatio: number;
  logW: number;
  logH: number;
}

function createWgpuTextLabelData(_state: RenderState, _source: Renderable): RendererData {
  return createWgpuRendererData({
    surface: null,
    lastContentId: -1,
    lastPixelRatio: 0,
    logW: 0,
    logH: 0,
  });
}

// Remove the GPU cache entry while its Image key is still valid, then return the raster allocation to
// the provider that created it. A node that never rasterized owns neither resource.
function destroyWgpuTextLabelData(state: WgpuRenderState, data: RendererData): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const textLabelData = getWgpuRendererData<WgpuTextLabelData>(data);
  if (textLabelData === null) return;
  const { surface } = textLabelData;
  if (surface === null) return;
  const entry = runtime.context.textureSourcePremultipliedTextureCache.get(surface.image);
  if (entry !== undefined) {
    entry.texture.destroy();
    runtime.context.textureSourcePremultipliedTextureCache.delete(surface.image);
  }
  destroyRaster2DSurface(surface);
}

export function drawWgpuTextLabel(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = renderProxy.source as TextLabel;
  const { text, textFormat, width: fieldWidth, height: fieldHeight } = source.data;
  if (text.length === 0) return;
  if (renderProxy.rendererData === null) return;

  const material = renderProxy.material;
  const materialRenderer = resolveWgpuMaterialRenderer(state, material);
  if (materialRenderer === null) return;

  const textData = getWgpuRendererData<WgpuTextLabelData>(renderProxy.rendererData);
  if (textData === null) return;
  const surface = acquireWgpuTextLabelRasterSurface(textData);
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

    // Bump the resource version so the batch's version-aware cache re-uploads (recreating the GPU texture,
    // which covers a physical-size change too).
    invalidateImageResource(surface.image);

    textData.logW = w;
    textData.logH = h;
  }

  if (textData.logW <= 0 || textData.logH <= 0) return;

  ensureWgpuQuadBatchResources(state);

  const textureEntry = bindWgpuImageResourceTexture(state, surface.image, false, true);
  if (textureEntry === null) return;
  const base = prepareWgpuQuadBatchWrite(
    state,
    textureEntry,
    null,
    renderProxy.blendMode,
    material,
    materialRenderer,
    1,
  );
  const startCount = runtime.quadBatchWriterCount;
  const d = runtime.quadBatchWriterInstanceData;
  const t = renderProxy.transform2D;
  d[base] = t.a;
  d[base + 1] = t.b;
  d[base + 2] = t.c;
  d[base + 3] = t.d;
  d[base + 4] = t.tx;
  d[base + 5] = t.ty;
  d[base + 6] = textData.logW;
  d[base + 7] = textData.logH;
  d[base + 8] = 0;
  d[base + 9] = 0;
  d[base + 10] = 1;
  d[base + 11] = 1;
  d[base + 12] = renderProxy.alpha;
  packWgpuQuadBatchMaterialInstance(state, renderProxy.materialData, startCount);
  recordWgpuQuadBatchColorScaleBias(state, renderProxy.colorMatrix ?? renderProxy.colorScaleBias, startCount);
  runtime.quadBatchWriterCount++;
}

export const defaultWgpuTextLabelRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad,
  createData: createWgpuTextLabelData,
  destroyData: destroyWgpuTextLabelData,
  submit: drawWgpuTextLabel,
};

function acquireWgpuTextLabelRasterSurface(data: WgpuTextLabelData): Raster2DSurface | null {
  if (data.surface !== null) return data.surface;
  const surface = createRaster2DSurface(1, 1);
  if (surface !== null) data.surface = surface;
  return surface;
}
