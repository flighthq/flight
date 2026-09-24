import { computeRgbHexString, computeRgbaCssString } from '@flighthq/color/contract';
import { invalidateImageResource } from '@flighthq/image/contract';
import { bindWgpuImageResourceTexture, drawWgpuQuad } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime, resolveWgpuApplyBlendMode } from '@flighthq/render-wgpu/contract';
import { createCanvasHostSurface, destroyCanvasHostSurface } from '@flighthq/render/contract';
import { computeTextFormatFontString } from '@flighthq/text/contract';
import { getRichTextPasswordCharacter, getRichTextRuntime } from '@flighthq/text/contract';
import {
  computeRichTextContent,
  computeTextBoundsHeight,
  computeTextBoundsOffsetX,
  computeTextBoundsWidth,
  computeTextLayout,
  getRichTextContent,
  getRichTextScrollYOffset,
  getTextLayoutResult,
} from '@flighthq/textlayout/contract';
import type {
  CanvasSurface,
  ImageResource,
  NodeAny,
  RendererData,
  RenderProxy2D,
  RenderState,
  RichText,
  RichTextRuntime,
  Scene2DRenderer,
  TextFormat,
  TextLabelRuntime,
  WgpuRenderState,
  WgpuRichTextOverlay,
} from '@flighthq/types/contract';

import { flushWgpuQuadBatchWriter } from './wgpuQuadBatchWriter';
import { createWgpuRendererData, getWgpuRendererData } from './wgpuRendererData';

// The raster surface belongs to the render node rather than the module. Its Image identity is the
// GPU-cache key, so two RichText nodes drawn in one frame cannot overwrite each other's upload.
interface WgpuRichTextData extends RendererData {
  allocH: number;
  allocW: number;
  image: ImageResource | null;
  surface: CanvasSurface | null;
}

export function createWgpuRichTextData(_state: RenderState, _source: NodeAny): RendererData {
  return createWgpuRendererData({ allocH: 0, allocW: 0, image: null, surface: null });
}

// Remove the GPU cache entry while its Image key is still valid, then return the raster allocation to
// the provider that created it. A node that never rasterized owns neither resource.
export function destroyWgpuRichTextData(state: WgpuRenderState, data: RendererData): void {
  const richData = getWgpuRendererData<WgpuRichTextData>(data);
  if (richData === null) return;
  const { image, surface } = richData;
  if (image !== null) {
    const cache = getWgpuRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    const entry = cache.get(image);
    if (entry !== undefined) {
      entry.texture.destroy();
      cache.delete(image);
    }
  }
  if (surface !== null) destroyCanvasHostSurface(surface);
}

export function drawWgpuRichText(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  // The editable-input overlay rasterizes onto the offscreen field texture, so it is passed into the
  // rasterization pass — only when the input slot is present. registerWgpuTextInputOverlay
  // (enableWgpuTextInput) installs it; a static RichText leaves the slot null and pulls no text-input code.
  const overlay =
    _webgpuTextInputOverlay !== null && getRichTextRuntime(renderProxy.source as RichText).input !== null
      ? _webgpuTextInputOverlay
      : undefined;
  drawWgpuRichTextWithOverlay(state, renderProxy, overlay);
}

export function drawWgpuRichTextWithOverlay(
  state: WgpuRenderState,
  renderProxy: RenderProxy2D,
  overlay?: WgpuRichTextOverlay,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;
  flushWgpuQuadBatchWriter(state);

  const source = renderProxy.source as RichText;
  const data = source.data;
  const richTextRuntime = getRichTextRuntime(source) as RichTextRuntime;
  const content = getRichTextContent(richTextRuntime);
  computeRichTextContent(content, data, getRichTextPasswordCharacter(source));
  if (content.text.length === 0 && !data.background && !data.border) return;
  const richData = getWgpuRendererData<WgpuRichTextData>(renderProxy.rendererData);
  if (richData === null || state.canvasHost === null || state.imageHost === null) return;
  let surface = richData.surface ?? _ensureWgpuRichTextSurface(state, richData, 1, 1);
  if (surface === null) return;

  const result = layoutRichText(source, richTextRuntime, content.text, content.formatRanges, state, surface.context);
  const maxTexDim = state.device.limits.maxTextureDimension2D;
  const pixelRatio = state.pixelRatio;
  const maxLogical = Math.floor(maxTexDim / pixelRatio);
  const fieldW = Math.min(Math.ceil(computeTextBoundsWidth(data, result)), maxLogical);
  const fieldH = Math.min(Math.ceil(computeTextBoundsHeight(data, result)), maxLogical);
  if (fieldW <= 0 || fieldH <= 0) return;

  const pw = Math.ceil(fieldW * pixelRatio);
  const ph = Math.ceil(fieldH * pixelRatio);
  surface = _ensureWgpuRichTextSurface(state, richData, pw, ph);
  if (surface === null) return;
  const offCtx = surface.context;
  offCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  offCtx.clearRect(0, 0, fieldW, fieldH);

  if (data.background) {
    offCtx.fillStyle = computeRgbHexString(data.backgroundColor);
    offCtx.fillRect(0, 0, fieldW, fieldH);
  }

  if (data.border) {
    offCtx.strokeStyle = computeRgbHexString(data.borderColor);
    offCtx.lineWidth = 1;
    offCtx.strokeRect(0, 0, fieldW, fieldH);
  }

  if (content.text.length > 0) {
    drawRichTextToCanvas(offCtx, source, result, fieldW, fieldH, content.text);
  }
  overlay?.(offCtx, source, result, fieldW, fieldH, content.text);
  if (richData.image !== null) invalidateImageResource(richData.image);

  resolveWgpuApplyBlendMode(state)?.(state, renderProxy.blendMode);
  if (richData.image === null) return;
  const entry = bindWgpuImageResourceTexture(state, richData.image, false, true);
  if (entry === null) return;

  // Anchor the field box for autoSize 'right'/'center' so the rendered quad lines up with the local
  // bounds (computeRichTextLocalBoundsRectangle applies the same offset). Zero for 'none'/'left'.
  const offsetX = computeTextBoundsOffsetX(data, result);
  drawWgpuQuad(state, renderProxy, entry, offsetX, 0, offsetX + fieldW, fieldH, 0, 0, 1, 1);
}

export function registerWgpuTextInputOverlay(overlay: WgpuRichTextOverlay): void {
  _webgpuTextInputOverlay = overlay;
}

export const wgpuRichTextRenderer: Scene2DRenderer = {
  createData: createWgpuRichTextData,
  destroyData: destroyWgpuRichTextData,
  submit: drawWgpuRichText,
};

function drawRichTextToCanvas(
  context: CanvasRenderingContext2D,
  source: RichText,
  result: ReturnType<typeof getTextLayoutResult>,
  fieldW: number,
  fieldH: number,
  text: string,
): void {
  const data = source.data;
  const firstVisibleLine = data.scrollV - 1;
  const scrollYOffset = firstVisibleLine > 0 ? getRichTextScrollYOffset(result.lineHeights, firstVisibleLine) : 0;
  const scrollXOffset = data.scrollH;

  context.save();
  context.beginPath();
  context.rect(0, 0, fieldW, fieldH);
  context.clip();
  context.textBaseline = 'alphabetic';
  context.textAlign = 'start';

  for (const group of result.groups) {
    if (group.lineIndex < firstVisibleLine) continue;

    context.font = computeTextFormatFontString(group.format);
    context.fillStyle = computeRgbaCssString(group.format.color ?? data.textColor);
    const slice = text.substring(group.startIndex, group.endIndex);
    const x = group.offsetX - scrollXOffset;
    const y = group.offsetY + group.ascent - scrollYOffset;
    context.fillText(slice, x, y);

    if (group.format.underline || group.format.strikethrough) {
      context.strokeStyle = computeRgbaCssString(group.format.color ?? data.textColor);
      context.lineWidth = Math.max(1, (group.format.size ?? 12) / 16);
      if (group.format.underline) {
        const lineY = y + group.descent;
        context.beginPath();
        context.moveTo(x, lineY);
        context.lineTo(x + group.width, lineY);
        context.stroke();
      }
      // Strikethrough sits ~35% of the ascent above the baseline — through the middle of the glyphs,
      // matching scene2d-canvas's canvasRichText.
      if (group.format.strikethrough) {
        const lineY = y - group.ascent * 0.35;
        context.beginPath();
        context.moveTo(x, lineY);
        context.lineTo(x + group.width, lineY);
        context.stroke();
      }
    }
  }

  context.restore();
}

function layoutRichText(
  source: RichText,
  richTextRuntime: RichTextRuntime,
  text: string,
  formatRanges: Parameters<typeof computeTextLayout>[1]['formatRanges'],
  state: WgpuRenderState,
  context: CanvasRenderingContext2D,
): ReturnType<typeof getTextLayoutResult> {
  const data = source.data;
  const maxTexDim = state.device.limits.maxTextureDimension2D;
  const maxLogical = Math.floor(maxTexDim / state.pixelRatio);

  const measure = (value: string, format: TextFormat): number => {
    context.font = computeTextFormatFontString(format);
    return context.measureText(value).width;
  };

  const result = getTextLayoutResult(richTextRuntime as TextLabelRuntime);
  computeTextLayout(result, {
    formatRanges,
    height: Math.min(data.height, maxLogical),
    measure,
    multiline: data.multiline,
    text,
    verticalAlign: data.autoSize === 'none' ? data.verticalAlign : 'top',
    width: Math.min(data.wordWrap ? data.width : 10000, maxLogical),
    wordWrap: data.wordWrap,
  });
  return result;
}

// Returns a surface at the requested pixel dimensions, creating or resizing via destroy+recreate as
// needed. The paired image resource stays in sync with the surface lifecycle.
function _ensureWgpuRichTextSurface(
  state: WgpuRenderState,
  data: WgpuRichTextData,
  pw: number,
  ph: number,
): CanvasSurface | null {
  if (data.surface !== null && data.allocW === pw && data.allocH === ph) return data.surface;
  if (data.surface !== null) {
    if (data.image !== null) {
      const cache = getWgpuRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
      const entry = cache.get(data.image);
      if (entry !== undefined) {
        entry.texture.destroy();
        cache.delete(data.image);
      }
    }
    destroyCanvasHostSurface(data.surface);
  }
  const canvasHost = state.canvasHost;
  const imageHost = state.imageHost;
  if (canvasHost === null || imageHost === null) {
    data.surface = null;
    data.image = null;
    data.allocW = 0;
    data.allocH = 0;
    return null;
  }
  const surface = createCanvasHostSurface(canvasHost, pw, ph);
  if (surface === null) {
    data.surface = null;
    data.image = null;
    data.allocW = 0;
    data.allocH = 0;
    return null;
  }
  data.surface = surface;
  data.image = imageHost.createImageFromSurface?.(surface) ?? null;
  data.allocW = pw;
  data.allocH = ph;
  return surface;
}

let _webgpuTextInputOverlay: WgpuRichTextOverlay | null = null;
