import { mapCanvasScale9ShapeCommands, renderCanvasShapeCommands } from '@flighthq/displayobject-canvas';
import { getNodeLocalBoundsRectangle, getNodeLocalContentRevision } from '@flighthq/node';
import { createWgpuTextureEntry, drawWgpuQuadWithTransform, updateWgpuTextureEntry } from '@flighthq/render-wgpu';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  DisplayObjectRenderer,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  Scale9Shape,
  WgpuRenderState,
  WgpuTextureEntry,
} from '@flighthq/types';

import { buildWgpuScale9Mapper } from './webgpuScale9Mapper';
import { drawWgpuShape } from './webgpuShape';
import { flushWgpuSpriteBatch } from './webgpuSpriteBatch';

// Scale9 rasterizes its remapped shape commands to a 2D canvas at the scaled size, uploads that as a
// per-node GPU texture, and draws a quad with the scale stripped from the transform (the size is
// already baked into the texture). Mirrors the Gl Scale9 renderer; the canvas rasterization and
// command remapping are shared with it via displayobject-canvas.
interface WgpuScale9ShapeData {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lastH: number;
  lastScaleX: number;
  lastScaleY: number;
  lastContentId: number;
  lastW: number;
  entry: WgpuTextureEntry | null;
}

export function createWgpuScale9ShapeData(_state: RenderState, _source: Renderable): RendererData {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return {
    canvas,
    ctx,
    lastH: 0,
    lastScaleX: -1,
    lastScaleY: -1,
    lastContentId: -1,
    lastW: 0,
    entry: null,
  } as unknown as RendererData;
}

// Scale9 owns its texture directly (created lazily on first draw), so destroy it on teardown.
export function destroyWgpuScale9ShapeData(_state: RenderState, data: RendererData): void {
  const shapeData = data as unknown as WgpuScale9ShapeData;
  shapeData.entry?.texture.destroy();
}

export function drawWgpuScale9Shape(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;
  flushWgpuSpriteBatch(state);

  const source = renderProxy.source as Scale9Shape;
  const { commands, scale9Grid } = source.data;
  const version = getNodeLocalContentRevision(source);
  if (commands.length === 0) return;
  if (renderProxy.rendererData === null) return;

  const bounds = getNodeLocalBoundsRectangle(source);
  const mapper = buildWgpuScale9Mapper(bounds, scale9Grid, source.scaleX, source.scaleY);
  if (mapper === null) {
    drawWgpuShape(state, renderProxy);
    return;
  }

  const shapeData = renderProxy.rendererData as unknown as WgpuScale9ShapeData;
  const w = Math.ceil(bounds.width * source.scaleX);
  const h = Math.ceil(bounds.height * source.scaleY);
  if (w <= 0 || h <= 0) return;

  if (
    version !== shapeData.lastContentId ||
    w !== shapeData.lastW ||
    h !== shapeData.lastH ||
    source.scaleX !== shapeData.lastScaleX ||
    source.scaleY !== shapeData.lastScaleY
  ) {
    shapeData.canvas.width = w;
    shapeData.canvas.height = h;
    const ctx = shapeData.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    remapWgpuScale9Commands(_remappedCommands, commands, mapper);
    ctx.translate(-bounds.x, -bounds.y);
    renderCanvasShapeCommands(ctx, _remappedCommands);
    ctx.restore();

    // GPU textures are fixed-size: recreate the entry when the field size changes, otherwise reupload
    // the canvas pixels into the existing entry.
    if (shapeData.entry === null || shapeData.lastW !== w || shapeData.lastH !== h) {
      shapeData.entry?.texture.destroy();
      shapeData.entry = createWgpuTextureEntry(state, w, h, shapeData.canvas);
    } else {
      updateWgpuTextureEntry(state, shapeData.entry, shapeData.canvas);
    }

    shapeData.lastH = h;
    shapeData.lastScaleX = source.scaleX;
    shapeData.lastScaleY = source.scaleY;
    shapeData.lastContentId = version;
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

export function remapWgpuScale9Commands(
  out: unknown[],
  source: readonly unknown[],
  mapper: Parameters<typeof mapCanvasScale9ShapeCommands>[2],
): void {
  mapCanvasScale9ShapeCommands(out, source, mapper);

  let i = 0;
  while (i < out.length) {
    const key = out[i] as string;
    const argCount = out[i + 1] as number;
    if (key === 'drawPath') {
      const pathData = out[i + 3] as readonly number[];
      _remappedPathData.length = pathData.length;
      for (let k = 0; k < pathData.length; k++) _remappedPathData[k] = pathData[k];
      out[i + 3] = _remappedPathData;
    }
    i += argCount + 2;
  }
}

export const defaultWgpuScale9ShapeRenderer: DisplayObjectRenderer = {
  createData: createWgpuScale9ShapeData,
  destroyData: destroyWgpuScale9ShapeData,
  submit: drawWgpuScale9Shape,
};

const _remappedCommands: unknown[] = [];
const _remappedPathData: number[] = [];
