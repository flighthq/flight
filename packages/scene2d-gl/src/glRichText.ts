import { computeRgbHexString } from '@flighthq/color/contract';
import { computeRgbaCssString } from '@flighthq/color/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { invalidateImageResource } from '@flighthq/image/contract';
import { bindGlImageResourceTexture, drawGlQuad, useGlProgram } from '@flighthq/render-gl/contract';
import { getGlRenderStateRuntime, resolveGlShader } from '@flighthq/render-gl/contract';
import { createRaster2DSurface, destroyRaster2DSurface } from '@flighthq/render/contract';
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
  EntityConstruction,
  GlRenderState,
  GlRichTextOverlay,
  Raster2DSurface,
  Raster2DSurfaceProvider,
  RenderProxy2D,
  Renderable,
  RendererData,
  RichText,
  RichTextRuntime,
  Scene2DRenderer,
  TextFormat,
  TextLabelRuntime,
} from '@flighthq/types/contract';

import { flushGlQuadBatchWriter } from './glQuadBatchWriter';

// The raster surface belongs to the render node rather than the module. Its Image identity is the
// GPU-cache key, so two RichText nodes drawn in one frame cannot overwrite each other's upload.
interface GlRichTextData extends RendererData {
  surface: Raster2DSurface | null;
}

export function createGlRichTextData(_state: GlRenderState, _source: Renderable): RendererData {
  const out = allocateEntity<RendererData>();
  out.surface = null;
  return finishEntity(out);
}

// Remove the GPU realization while its Image key is still valid, then return the raster allocation to
// the provider that created it. A node that never rasterized owns neither resource.
export function destroyGlRichTextData(state: GlRenderState, data: RendererData): void {
  const { surface } = data as GlRichTextData;
  if (surface === null) return;
  const cache = getGlRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
  const entry = cache.get(surface.image);
  if (entry !== undefined) {
    state.gl.deleteTexture(entry.texture);
    cache.delete(surface.image);
  }
  destroyRaster2DSurface(surface);
}

export function drawGlRichText(state: GlRenderState, renderProxy: RenderProxy2D): void {
  // The editable-input overlay rasterizes onto the offscreen field texture, so it is passed into the
  // rasterization pass — only when the input slot is present. registerGlTextInputOverlay
  // (enableGlTextInput) installs it; a static RichText leaves the slot null and pulls no text-input code.
  const overlay =
    _webglTextInputOverlay !== null && getRichTextRuntime(renderProxy.source as RichText).input !== null
      ? _webglTextInputOverlay
      : undefined;
  drawGlRichTextWithOverlay(state, renderProxy, overlay);
}

export function drawGlRichTextWithOverlay(
  state: GlRenderState,
  renderProxy: RenderProxy2D,
  overlay?: GlRichTextOverlay,
): void {
  flushGlQuadBatchWriter(state);
  const source = renderProxy.source as RichText;
  const data = source.data;
  const richTextRuntime = getRichTextRuntime(source) as RichTextRuntime;
  const content = getRichTextContent(richTextRuntime);
  computeRichTextContent(content, data, getRichTextPasswordCharacter(source));
  if (content.text.length === 0 && !data.background && !data.border) return;
  if (renderProxy.rendererData === null || state.raster2DSurfaceProvider === null) return;
  const richTextData = renderProxy.rendererData as GlRichTextData;
  const surface = acquireGlRichTextRasterSurface(state.raster2DSurfaceProvider, richTextData);
  if (surface === null) return;

  const result = layoutRichText(source, richTextRuntime, content.text, content.formatRanges, surface.context);
  const fieldW = Math.ceil(computeTextBoundsWidth(data, result));
  const fieldH = Math.ceil(computeTextBoundsHeight(data, result));
  if (fieldW <= 0 || fieldH <= 0) return;

  const pixelRatio = state.pixelRatio;
  const pw = Math.ceil(fieldW * pixelRatio);
  const ph = Math.ceil(fieldH * pixelRatio);
  if (surface.width !== pw) surface.width = pw;
  if (surface.height !== ph) surface.height = ph;
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
  invalidateImageResource(surface.image);

  const shader = resolveGlShader(state, renderProxy);
  useGlProgram(state, shader);
  bindGlImageResourceTexture(state, surface.image, null, null, true);

  shader.bind(state.gl, state, renderProxy);

  // Anchor the field box for autoSize 'right'/'center' so the rendered quad lines up with the local
  // bounds (computeRichTextLocalBoundsRectangle applies the same offset). Zero for 'none'/'left'.
  const offsetX = computeTextBoundsOffsetX(data, result);
  drawGlQuad(state, offsetX, 0, offsetX + fieldW, fieldH, 0, 0, 1, 1);
}

export function registerGlTextInputOverlay(overlay: GlRichTextOverlay): void {
  _webglTextInputOverlay = overlay;
}

export const defaultGlRichTextRenderer: Scene2DRenderer = {
  createData: createGlRichTextData,
  destroyData: destroyGlRichTextData,
  submit: drawGlRichText,
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
  context: CanvasRenderingContext2D,
): ReturnType<typeof getTextLayoutResult> {
  const data = source.data;
  const measure = (value: string, format: TextFormat): number => {
    context.font = computeTextFormatFontString(format);
    return context.measureText(value).width;
  };

  const result = getTextLayoutResult(richTextRuntime as TextLabelRuntime);
  computeTextLayout(result, {
    text,
    formatRanges,
    width: data.width,
    height: data.height,
    measure,
    multiline: data.multiline,
    verticalAlign: data.autoSize === 'none' ? data.verticalAlign : 'top',
    wordWrap: data.wordWrap,
  });
  return result;
}

function acquireGlRichTextRasterSurface(
  provider: Readonly<Raster2DSurfaceProvider>,
  data: GlRichTextData,
): Raster2DSurface | null {
  if (data.surface !== null) return data.surface;
  const surface = createRaster2DSurface(provider, 1, 1);
  if (surface !== null) data.surface = surface;
  return surface;
}

let _webglTextInputOverlay: GlRichTextOverlay | null = null;
