import { createEntity } from '@flighthq/entity/contract';
import { invalidateImageResource } from '@flighthq/image/contract';
import { getNodeLocalBoundsRectangle, getNodeLocalContentRevision } from '@flighthq/node/contract';
import { bindGlImageResourceTexture, drawGlQuad, useGlProgram } from '@flighthq/render-gl/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { setGlBaseUniforms, setGlMatrixFromValues } from '@flighthq/render-gl/contract';
import { createRaster2DSurface, destroyRaster2DSurface } from '@flighthq/render/contract';
import { mapScale9ShapeCommands } from '@flighthq/shape/contract';
import type {
  GlContext,
  GlRenderState,
  MatrixLike,
  Raster2DSurface,
  Raster2DSurfaceProvider,
  RenderProxy2D,
  Renderable,
  RendererData,
  Scale9Shape,
  Scene2DRenderer,
  ShapeCommandToken,
} from '@flighthq/types/contract';
import { RenderRegistry, Scale9ShapeKind } from '@flighthq/types/contract';

import { flushGlQuadBatchWriter } from './glQuadBatchWriter';
import { buildGlScale9Mapper } from './glScale9Mapper';
import { drawGlShape } from './glShape';
import { getGlShapeRasterizer } from './glShapeRasterizer';

interface GlScale9ShapeData extends RendererData {
  lastH: number;
  lastScaleX: number;
  lastScaleY: number;
  lastContentId: number;
  lastPixelRatio: number;
  lastW: number;
  surface: Raster2DSurface | null;
}

const _remappedCommands: ShapeCommandToken[] = [];

export function acquireGlScale9ShapeRasterSurface(
  provider: Readonly<Raster2DSurfaceProvider>,
  data: GlScale9ShapeData,
): Raster2DSurface | null {
  const existing = data.surface;
  if (existing !== null) return existing;
  const surface = createRaster2DSurface(provider, 1, 1);
  if (surface === null) return null;
  data.surface = surface;
  return surface;
}

export function createGlScale9ShapeData(_state: GlRenderState, _source: Renderable): RendererData | null {
  return createEntity({
    lastH: 0,
    lastScaleX: -1,
    lastScaleY: -1,
    lastContentId: -1,
    lastPixelRatio: 0,
    lastW: 0,
    surface: null,
  });
}

// Remove the Image-keyed GPU entry before returning this per-node surface to the provider that created it.
export function destroyGlScale9ShapeData(state: GlRenderState, data: RendererData): void {
  const { surface } = getGlScale9ShapeData(data);
  if (surface === null) return;
  const cache = getGlRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
  const entry = cache.get(surface.image);
  if (entry !== undefined) {
    state.gl.deleteTexture(entry.texture);
    cache.delete(surface.image);
  }
  destroyRaster2DSurface(surface);
}

export function drawGlScale9Shape(state: GlRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  flushGlQuadBatchWriter(state);
  const source = renderProxy.source as Scale9Shape;
  const { commands, scale9Grid } = source.data;
  const version = getNodeLocalContentRevision(source);
  if (commands.length === 0) return;
  if (renderProxy.rendererData === null) return;

  // A fill with no tessellated form is the registered rasterizer's job; an absent one is reported
  // rather than quietly dropping the fill.
  const rasterizer = getGlShapeRasterizer(state);
  if (rasterizer === null) {
    getGlRenderStateRuntime(state).registryMiss?.(RenderRegistry.ShapeRasterizer, Scale9ShapeKind);
    return;
  }

  const bounds = getNodeLocalBoundsRectangle(source);
  const mapper = buildGlScale9Mapper(bounds, scale9Grid, source.scaleX, source.scaleY);
  if (mapper === null) {
    drawGlShape(state, renderProxy);
    return;
  }

  const shapeData = getGlScale9ShapeData(renderProxy.rendererData);
  const pixelRatio = state.pixelRatio;
  const w = Math.ceil(bounds.width * source.scaleX);
  const h = Math.ceil(bounds.height * source.scaleY);
  if (w <= 0 || h <= 0) return;
  if (state.raster2DSurfaceProvider === null) return;
  const surface = acquireGlScale9ShapeRasterSurface(state.raster2DSurfaceProvider, shapeData);
  if (surface === null) return;
  // Sized in device pixels with the replay pre-scaled to match, exactly as glTextLabel and glRichText
  // treat their offscreen canvases. The quad below stays in local units and samples the whole texture,
  // so a denser raster is only sharper — no geometry moves with it.

  if (
    version !== shapeData.lastContentId ||
    w !== shapeData.lastW ||
    h !== shapeData.lastH ||
    source.scaleX !== shapeData.lastScaleX ||
    source.scaleY !== shapeData.lastScaleY ||
    pixelRatio !== shapeData.lastPixelRatio
  ) {
    const pw = Math.ceil(w * pixelRatio);
    const ph = Math.ceil(h * pixelRatio);
    if (surface.width !== pw) surface.width = pw;
    if (surface.height !== ph) surface.height = ph;
    const { context } = surface;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, -bounds.x * pixelRatio, -bounds.y * pixelRatio);
    context.clearRect(bounds.x, bounds.y, w, h);
    mapScale9ShapeCommands(_remappedCommands, commands, mapper);
    rasterizer(context, _remappedCommands, state);
    context.setTransform(1, 0, 0, 1, 0, 0);
    invalidateImageResource(surface.image);
    shapeData.lastH = h;
    shapeData.lastScaleX = source.scaleX;
    shapeData.lastScaleY = source.scaleY;
    shapeData.lastContentId = version;
    shapeData.lastPixelRatio = pixelRatio;
    shapeData.lastW = w;
  }

  useGlProgram(state);

  const gl = state.gl;
  bindGlImageResourceTexture(state, surface.image, null, null, true);

  const { matrixArray } = runtime;
  const locations = runtime.context.currentShader!.locations!;
  setGlBaseUniforms(gl, locations, renderProxy);

  const t = renderProxy.transform2D;
  setStrippedGlMatrixFromValues(
    gl,
    locations,
    matrixArray,
    t,
    source.scaleX,
    source.scaleY,
    runtime.renderTargetViewport?.width ?? gl.drawingBufferWidth,
    runtime.renderTargetViewport?.height ?? gl.drawingBufferHeight,
  );

  drawGlQuad(state, 0, 0, w, h, 0, 0, 1, 1);
}

export function drawGlScale9ShapeMask(state: GlRenderState, data: RenderProxy2D): void {
  drawGlScale9Shape(state, data);
}

export const defaultGlScale9ShapeRenderer: Scene2DRenderer = {
  createData: createGlScale9ShapeData,
  destroyData: destroyGlScale9ShapeData,
  submit: drawGlScale9Shape,
};

export function getGlScale9ShapeData(data: RendererData): GlScale9ShapeData {
  return data as GlScale9ShapeData;
}

function setStrippedGlMatrixFromValues(
  gl: GlContext,
  loc: Parameters<typeof setGlMatrixFromValues>[1],
  m: Float32Array,
  t: Readonly<MatrixLike>,
  scaleX: number,
  scaleY: number,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const a = scaleX !== 0 ? t.a / scaleX : t.a;
  const b = scaleX !== 0 ? t.b / scaleX : t.b;
  const c = scaleY !== 0 ? t.c / scaleY : t.c;
  const d = scaleY !== 0 ? t.d / scaleY : t.d;
  setGlMatrixFromValues(gl, loc, m, a, b, c, d, t.tx, t.ty, viewportWidth, viewportHeight);
}
