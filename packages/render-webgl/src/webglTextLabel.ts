import { computeRGBHexString } from '@flighthq/materials';
import { getNodeLocalContentRevision } from '@flighthq/node';
import { computeTextFormatFontString } from '@flighthq/render';
import { getTextLabelRuntime } from '@flighthq/text';
import { computeTextLayout, createTextFormatRange, getTextLayoutResult } from '@flighthq/text-layout';
import type {
  DisplayObjectRenderer,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  TextFormat,
  TextLabel,
  TextLabelRuntime,
} from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { resolveWebGLMaterialRenderer } from './webglMaterialRegistry';
import {
  ensureWebGLQuadBatchShader,
  packWebGLSpriteBatchMaterialInstance,
  prepareWebGLSpriteBatchWrite,
} from './webglSpriteBatch';

interface WebGLTextLabelData {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  // Content revision and pixel ratio at last rasterization. Re-rasterization is driven by the
  // upstream TextLabel content version (bumped by TextLabel setters on layout-affecting changes), never by
  // appearance-only changes such as alpha.
  lastContentID: number;
  lastPixelRatio: number;
  logW: number;
  logH: number;
}

function createWebGLTextLabelData(_state: RenderState, _source: Renderable): RendererData {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, lastContentID: -1, lastPixelRatio: 0, logW: 0, logH: 0 } as unknown as RendererData;
}

// Free the GPU texture the batch uploaded for this node's canvas when the text node is torn down.
function destroyWebGLTextLabelData(state: RenderState, data: RendererData): void {
  const internal = state as WebGLRenderStateInternal;
  const { canvas } = data as unknown as WebGLTextLabelData;
  const texture = internal.textureCache.get(canvas);
  if (texture !== undefined) {
    internal.gl.deleteTexture(texture);
    internal.textureCache.delete(canvas);
  }
}

export function drawWebGLTextLabel(state: RenderState, renderProxy: RenderProxy2D): void {
  const internal = state as WebGLRenderStateInternal;
  const source = renderProxy.source as TextLabel;
  const { text, textFormat, width: fieldWidth, height: fieldHeight } = source.data;
  if (text.length === 0) return;
  if (renderProxy.rendererData === null) return;

  const material = renderProxy.material;
  const materialRenderer = resolveWebGLMaterialRenderer(internal, material);
  if (materialRenderer === null) return;

  const textData = renderProxy.rendererData as unknown as WebGLTextLabelData;
  const pixelRatio = internal.pixelRatio;
  const version = getNodeLocalContentRevision(source);

  if (version !== textData.lastContentID || pixelRatio !== textData.lastPixelRatio) {
    const measure = (t: string, format: TextFormat): number => {
      textData.ctx.font = computeTextFormatFontString(format);
      return textData.ctx.measureText(t).width;
    };

    const result = getTextLayoutResult(getTextLabelRuntime(source) as TextLabelRuntime);
    computeTextLayout(result, {
      text,
      formatRanges: [createTextFormatRange(textFormat, 0, text.length)],
      width: fieldWidth,
      height: fieldHeight,
      measure,
    });

    textData.lastContentID = version;
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
    const w = Math.ceil(maxX);
    const h = Math.ceil(maxY);
    if (w <= 0 || h <= 0) return;

    const pw = Math.ceil(w * pixelRatio);
    const ph = Math.ceil(h * pixelRatio);
    textData.canvas.width = pw;
    textData.canvas.height = ph;

    const ctx = textData.ctx;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'start';

    for (const group of result.groups) {
      ctx.font = computeTextFormatFontString(group.format);
      ctx.fillStyle = computeRGBHexString(group.format.color ?? 0);
      const slice = text.substring(group.startIndex, group.endIndex);
      ctx.fillText(slice, group.offsetX, group.offsetY + group.ascent * 0.815);
    }

    // Invalidate cached GPU texture so the batch re-uploads from the updated canvas.
    internal.textureCache.delete(textData.canvas);
    textData.logW = w;
    textData.logH = h;
  }

  if (textData.logW <= 0 || textData.logH <= 0) return;

  ensureWebGLQuadBatchShader(internal);

  const startCount = internal.spriteBatchCount;
  const base = prepareWebGLSpriteBatchWrite(
    internal,
    textData.canvas,
    renderProxy.blendMode,
    material,
    materialRenderer,
    1,
  );
  const d = internal.spriteBatchInstanceData;
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
  packWebGLSpriteBatchMaterialInstance(internal, renderProxy.materialData, startCount);
  internal.spriteBatchCount++;
}

export const defaultWebGLTextLabelRenderer: DisplayObjectRenderer = {
  format: BatchFormat.Quad,
  createData: createWebGLTextLabelData,
  destroyData: destroyWebGLTextLabelData,
  submit: drawWebGLTextLabel,
};
