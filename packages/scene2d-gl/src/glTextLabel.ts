import { computeRgbaCssString } from '@flighthq/color/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { invalidateImageResource } from '@flighthq/image/contract';
import { getNodeLocalContentRevision } from '@flighthq/node/contract';
import { bindGlImageResourceTexture, resolveGlQuadMaterialRenderer } from '@flighthq/render-gl/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { createCanvasHostSurface, destroyCanvasHostSurface } from '@flighthq/render/contract';
import { computeTextFormatFontString } from '@flighthq/text/contract';
import { getTextLabelRuntime } from '@flighthq/text/contract';
import { computeTextLayout, createTextFormatRange, getTextLayoutResult } from '@flighthq/textlayout/contract';
import type {
  CanvasSurface,
  EntityConstruction,
  GlRenderState,
  ImageResource,
  RenderProxy2D,
  NodeAny,
  RendererData,
  Scene2DRenderer,
  TextFormat,
  TextLabel,
  TextLabelRuntime,
} from '@flighthq/types/contract';
import { BatchFormat } from '@flighthq/types/contract';

import {
  QUAD_BATCH_INSTANCE_FLOATS,
  ensureGlQuadBatchShader,
  packGlQuadBatchMaterialInstance,
  prepareGlQuadBatchWrite,
  recordGlQuadBatchColorScaleBias,
  writeGlQuadBatchInstance,
} from './glQuadBatchWriter';

// NodeRenderer-private scratch state stored as an Entity in the opaque RendererData slot.
interface GlTextLabelData extends RendererData {
  allocH: number;
  allocW: number;
  image: ImageResource | null;
  // Content revision and pixel ratio at last rasterization.
  lastContentId: number;
  lastPixelRatio: number;
  logH: number;
  logW: number;
  surface: CanvasSurface | null;
}

function getGlTextLabelData(data: RendererData): GlTextLabelData {
  return data as GlTextLabelData;
}

function createGlTextLabelData(_state: GlRenderState, _source: NodeAny): RendererData {
  const out = allocateEntity<GlTextLabelData>();
  initializeGlTextLabelData(out);
  return finishEntity(out);
}

// Remove the GPU cache entry while its Image key is still valid, then return the raster allocation to
// the host that created it. A node that never rasterized owns neither resource.
function destroyGlTextLabelData(state: GlRenderState, data: RendererData): void {
  const runtime = getGlRenderStateRuntime(state);
  const textData = getGlTextLabelData(data);
  if (textData.surface === null) return;
  if (textData.image !== null) {
    const entry = runtime.context.textureSourcePremultipliedTextureCache.get(textData.image);
    if (entry !== undefined) {
      state.gl.deleteTexture(entry.texture);
      runtime.context.textureSourcePremultipliedTextureCache.delete(textData.image);
    }
  }
  destroyCanvasHostSurface(textData.surface);
}

export function drawGlTextLabel(state: GlRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const source = renderProxy.source as TextLabel;
  const { text, textFormat, width: fieldWidth, height: fieldHeight } = source.data;
  if (text.length === 0) return;
  if (renderProxy.rendererData === null) return;

  const material = renderProxy.material;
  const materialRenderer = resolveGlQuadMaterialRenderer(state, material);
  if (materialRenderer === null) return;

  if (state.canvasHost === null || state.imageHost === null) return;
  const textData = getGlTextLabelData(renderProxy.rendererData);
  let surface = _ensureGlTextLabelSurface(state, textData, 1, 1);
  if (surface === null) return;
  const pixelRatio = state.pixelRatio;
  const version = getNodeLocalContentRevision(source);

  if (version !== textData.lastContentId || pixelRatio !== textData.lastPixelRatio) {
    const measure = (t: string, format: TextFormat): number => {
      surface!.context.font = computeTextFormatFontString(format);
      return surface!.context.measureText(t).width;
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
    const w = Math.ceil(maxX);
    const h = Math.ceil(maxY);
    if (w <= 0 || h <= 0) return;

    const pw = Math.ceil(w * pixelRatio);
    const ph = Math.ceil(h * pixelRatio);
    surface = _ensureGlTextLabelSurface(state, textData, pw, ph);
    if (surface === null) return;

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

    invalidateImageResource(textData.image!);
    textData.logW = w;
    textData.logH = h;
  }

  if (textData.logW <= 0 || textData.logH <= 0) return;

  ensureGlQuadBatchShader(state);

  const texture = bindGlImageResourceTexture(state, textData.image!, null, null, true);
  const straightAlpha = runtime.context.currentTextureRealization!.straightAlpha;
  const startInstance = prepareGlQuadBatchWrite(
    state,
    texture,
    straightAlpha,
    null,
    renderProxy.blendMode,
    material,
    materialRenderer,
    1,
  );
  const base = startInstance * QUAD_BATCH_INSTANCE_FLOATS;
  const d = runtime.quadBatchWriterInstanceData;
  const t = renderProxy.transform2D;
  writeGlQuadBatchInstance(d, base, t, textData.logW, textData.logH, 0, 0, 1, 1, renderProxy.alpha);
  packGlQuadBatchMaterialInstance(state, renderProxy.materialData, startInstance);
  recordGlQuadBatchColorScaleBias(state, renderProxy.colorMatrix ?? renderProxy.colorScaleBias, startInstance);
  runtime.quadBatchWriterCount++;
}

export function initializeGlTextLabelData(out: EntityConstruction<GlTextLabelData>): void {
  out.allocH = 0;
  out.allocW = 0;
  out.image = null;
  out.lastContentId = -1;
  out.lastPixelRatio = 0;
  out.logH = 0;
  out.logW = 0;
  out.surface = null;
}

export const glTextLabelRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad,
  createData: createGlTextLabelData,
  destroyData: destroyGlTextLabelData,
  submit: drawGlTextLabel,
};

function _ensureGlTextLabelSurface(
  state: GlRenderState,
  data: GlTextLabelData,
  pw: number,
  ph: number,
): CanvasSurface | null {
  if (data.surface !== null && data.allocW === pw && data.allocH === ph) return data.surface;
  if (data.surface !== null) {
    if (data.image !== null) {
      const cache = getGlRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
      const entry = cache.get(data.image);
      if (entry !== undefined) {
        state.gl.deleteTexture(entry.texture);
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
