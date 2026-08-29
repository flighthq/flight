import { invalidateImageResource } from '@flighthq/image/contract';
import { getNodeLocalBoundsRectangle, getNodeLocalContentRevision } from '@flighthq/node/contract';
import { bindWgpuImageResourceTexture, drawWgpuQuadWithTransform } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createRaster2DSurface, destroyRaster2DSurface } from '@flighthq/render/contract';
import { mapScale9ShapeCommands } from '@flighthq/shape/contract';
import type {
  RenderProxy2D,
  Raster2DSurface,
  RenderState,
  Renderable,
  RendererData,
  Scale9Shape,
  Scene2DRenderer,
  ShapeCommandToken,
  WgpuRenderState,
} from '@flighthq/types/contract';
import { RenderRegistry, Scale9ShapeKind } from '@flighthq/types/contract';

import { flushWgpuQuadBatchWriter } from './wgpuQuadBatchWriter';
import { createWgpuRendererData, getWgpuRendererData } from './wgpuRendererData';
import { buildWgpuScale9Mapper } from './wgpuScale9Mapper';
import { drawWgpuShape } from './wgpuShape';
import { getWgpuShapeRasterizer } from './wgpuShapeRasterizer';

// Scale9 rasterizes its remapped shape commands into a per-node 2D surface at the scaled size, uploads
// that surface's stable Image through the shared texture cache, and draws a quad with the scale stripped
// from the transform (the size is already baked into the texture). Mirrors the Gl Scale9 renderer.
interface WgpuScale9ShapeData {
  lastH: number;
  lastScaleX: number;
  lastScaleY: number;
  lastContentId: number;
  lastPixelRatio: number;
  lastW: number;
  surface: Raster2DSurface | null;
}

export function acquireWgpuScale9ShapeRasterSurface(data: WgpuScale9ShapeData): Raster2DSurface | null {
  const existing = data.surface;
  if (existing !== null) return existing;
  const surface = createRaster2DSurface(1, 1);
  if (surface === null) return null;
  data.surface = surface;
  return surface;
}

export function createWgpuScale9ShapeData(_state: RenderState, _source: Renderable): RendererData {
  return createWgpuRendererData<WgpuScale9ShapeData>({
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
export function destroyWgpuScale9ShapeData(state: WgpuRenderState, data: RendererData): void {
  const shapeData = getWgpuScale9ShapeData(data);
  if (shapeData === null || shapeData.surface === null) return;
  const { surface } = shapeData;
  const cache = getWgpuRenderStateRuntime(state).textureSourcePremultipliedTextureCache;
  const entry = cache.get(surface.image);
  if (entry !== undefined) {
    entry.texture.destroy();
    cache.delete(surface.image);
  }
  destroyRaster2DSurface(surface);
}

export function drawWgpuScale9Shape(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;
  flushWgpuQuadBatchWriter(state);

  const source = renderProxy.source as Scale9Shape;
  const { commands, scale9Grid } = source.data;
  const version = getNodeLocalContentRevision(source);
  if (commands.length === 0) return;
  if (renderProxy.rendererData === null) return;

  // A fill with no tessellated form is the registered rasterizer's job; an absent one is reported
  // rather than quietly dropping the fill.
  const rasterizer = getWgpuShapeRasterizer(state);
  if (rasterizer === null) {
    getWgpuRenderStateRuntime(state).registryMiss?.(RenderRegistry.ShapeRasterizer, Scale9ShapeKind);
    return;
  }

  const bounds = getNodeLocalBoundsRectangle(source);
  const mapper = buildWgpuScale9Mapper(bounds, scale9Grid, source.scaleX, source.scaleY);
  if (mapper === null) {
    drawWgpuShape(state, renderProxy);
    return;
  }

  const shapeData = getWgpuScale9ShapeData(renderProxy.rendererData);
  const pixelRatio = state.pixelRatio;
  if (shapeData === null) return;
  const w = Math.ceil(bounds.width * source.scaleX);
  const h = Math.ceil(bounds.height * source.scaleY);
  if (w <= 0 || h <= 0) return;
  const surface = acquireWgpuScale9ShapeRasterSurface(shapeData);
  if (surface === null) return;

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

  const entry = bindWgpuImageResourceTexture(state, surface.image, false, true);
  if (entry === null) return;

  // Strip the node scale from the transform: the texture is already rasterized at the scaled size, so
  // the quad must be drawn at unit scale (only the non-scale parts of the transform apply).
  const t = renderProxy.transform2D;
  const a = source.scaleX !== 0 ? t.a / source.scaleX : t.a;
  const b = source.scaleX !== 0 ? t.b / source.scaleX : t.b;
  const c = source.scaleY !== 0 ? t.c / source.scaleY : t.c;
  const d = source.scaleY !== 0 ? t.d / source.scaleY : t.d;
  drawWgpuQuadWithTransform(state, renderProxy, { a, b, c, d, tx: t.tx, ty: t.ty }, entry, 0, 0, w, h, 0, 0, 1, 1);
}

export function drawWgpuScale9ShapeMask(state: WgpuRenderState, data: RenderProxy2D): void {
  drawWgpuScale9Shape(state, data);
}

export const defaultWgpuScale9ShapeRenderer: Scene2DRenderer = {
  createData: createWgpuScale9ShapeData,
  destroyData: destroyWgpuScale9ShapeData,
  submit: drawWgpuScale9Shape,
};

export function getWgpuScale9ShapeData(data: RendererData): WgpuScale9ShapeData | null {
  return getWgpuRendererData<WgpuScale9ShapeData>(data);
}

const _remappedCommands: ShapeCommandToken[] = [];
