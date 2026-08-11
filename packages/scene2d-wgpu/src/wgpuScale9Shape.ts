import { getNodeLocalBoundsRectangle, getNodeLocalContentRevision } from '@flighthq/node/contract';
import {
  createWgpuTextureEntry,
  drawWgpuQuadWithTransform,
  updateWgpuTextureEntry,
} from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime, retireWgpuTexture } from '@flighthq/render-wgpu/contract';
import { mapScale9ShapeCommands } from '@flighthq/shape/contract';
import type {
  RenderProxy2D,
  RenderState,
  Renderable,
  RendererData,
  Scale9Shape,
  Scene2DRenderer,
  ShapeCommandToken,
  WgpuRenderState,
  WgpuTextureEntry,
} from '@flighthq/types/contract';
import { RenderRegistry, Scale9ShapeKind } from '@flighthq/types/contract';

import { flushWgpuQuadBatchWriter } from './wgpuQuadBatchWriter';
import { createWgpuRendererData, getWgpuRendererData } from './wgpuRendererData';
import { buildWgpuScale9Mapper } from './wgpuScale9Mapper';
import { drawWgpuShape } from './wgpuShape';
import { getWgpuShapeRasterizer } from './wgpuShapeRasterizer';

// Scale9 rasterizes its remapped shape commands to a 2D canvas at the scaled size, uploads that as a
// per-node GPU texture, and draws a quad with the scale stripped from the transform (the size is
// already baked into the texture). Mirrors the Gl Scale9 renderer; the canvas rasterization and
// command remapping are shared with it via scene2d-canvas.
interface WgpuScale9ShapeData {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lastH: number;
  lastScaleX: number;
  lastScaleY: number;
  lastContentId: number;
  lastPixelRatio: number;
  lastW: number;
  entry: WgpuTextureEntry | null;
}

export function createWgpuScale9ShapeData(_state: RenderState, _source: Renderable): RendererData {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return createWgpuRendererData<WgpuScale9ShapeData>({
    canvas,
    ctx,
    lastH: 0,
    lastScaleX: -1,
    lastScaleY: -1,
    lastContentId: -1,
    lastPixelRatio: 0,
    lastW: 0,
    entry: null,
  });
}

// Scale9 owns its texture directly (created lazily on first draw), so destroy it on teardown.
export function destroyWgpuScale9ShapeData(_state: RenderState, data: RendererData): void {
  const shapeData = getWgpuRendererData<WgpuScale9ShapeData>(data);
  if (shapeData === null) return;
  shapeData.entry?.texture.destroy();
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

  const shapeData = getWgpuRendererData<WgpuScale9ShapeData>(renderProxy.rendererData);
  const pixelRatio = state.pixelRatio;
  if (shapeData === null) return;
  const w = Math.ceil(bounds.width * source.scaleX);
  const h = Math.ceil(bounds.height * source.scaleY);
  if (w <= 0 || h <= 0) return;

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
    shapeData.canvas.width = pw;
    shapeData.canvas.height = ph;
    const ctx = shapeData.ctx;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, -bounds.x * pixelRatio, -bounds.y * pixelRatio);
    ctx.clearRect(bounds.x, bounds.y, w, h);
    mapScale9ShapeCommands(_remappedCommands, commands, mapper);
    rasterizer(ctx, _remappedCommands, state);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // GPU textures are fixed-size: recreate the entry when the device-pixel size changes — which a
    // pixelRatio change does even at a fixed field size — otherwise reupload into the existing entry.
    if (
      shapeData.entry === null ||
      shapeData.lastW !== w ||
      shapeData.lastH !== h ||
      shapeData.lastPixelRatio !== pixelRatio
    ) {
      const nextEntry = createWgpuTextureEntry(state, pw, ph, shapeData.canvas);
      if (nextEntry === null) return;
      // Retired rather than destroyed: this runs inside a draw, so a bind group recorded earlier in the
      // frame may still reference the outgoing texture, and the frame's submit has not happened yet.
      if (shapeData.entry !== null) retireWgpuTexture(state, shapeData.entry.texture);
      shapeData.entry = nextEntry;
    } else {
      updateWgpuTextureEntry(state, shapeData.entry, shapeData.canvas);
    }

    shapeData.lastH = h;
    shapeData.lastScaleX = source.scaleX;
    shapeData.lastScaleY = source.scaleY;
    shapeData.lastContentId = version;
    shapeData.lastPixelRatio = pixelRatio;
    shapeData.lastW = w;
  }

  if (shapeData.entry === null) return;

  // Strip the node scale from the transform: the texture is already rasterized at the scaled size, so
  // the quad must be drawn at unit scale (only the non-scale parts of the transform apply).
  const t = renderProxy.transform2D;
  const a = source.scaleX !== 0 ? t.a / source.scaleX : t.a;
  const b = source.scaleX !== 0 ? t.b / source.scaleX : t.b;
  const c = source.scaleY !== 0 ? t.c / source.scaleY : t.c;
  const d = source.scaleY !== 0 ? t.d / source.scaleY : t.d;
  drawWgpuQuadWithTransform(
    state,
    renderProxy,
    { a, b, c, d, tx: t.tx, ty: t.ty },
    shapeData.entry,
    0,
    0,
    w,
    h,
    0,
    0,
    1,
    1,
  );
}

export function drawWgpuScale9ShapeMask(state: WgpuRenderState, data: RenderProxy2D): void {
  drawWgpuScale9Shape(state, data);
}

export const defaultWgpuScale9ShapeRenderer: Scene2DRenderer = {
  createData: createWgpuScale9ShapeData,
  destroyData: destroyWgpuScale9ShapeData,
  submit: drawWgpuScale9Shape,
};

const _remappedCommands: ShapeCommandToken[] = [];
