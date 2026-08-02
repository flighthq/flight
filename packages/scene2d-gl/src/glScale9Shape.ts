import { getNodeLocalBoundsRectangle, getNodeLocalContentRevision } from '@flighthq/node/contract';
import { createGlTexture, drawGlQuad, updateGlTexture, useGlProgram } from '@flighthq/render-gl/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { setGlBaseUniforms, setGlMatrixFromValues } from '@flighthq/render-gl/contract';
import { mapScale9ShapeCommands } from '@flighthq/shape/contract';
import type {
  GlRenderState,
  MatrixLike,
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

interface GlScale9ShapeData {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lastH: number;
  lastScaleX: number;
  lastScaleY: number;
  lastContentId: number;
  lastW: number;
  texture: WebGLTexture;
}

const _remappedCommands: ShapeCommandToken[] = [];

export function createGlScale9ShapeData(state: GlRenderState, _source: Renderable): RendererData | null {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  const texture = createGlTexture(state);
  return {
    canvas,
    ctx,
    lastH: 0,
    lastScaleX: -1,
    lastScaleY: -1,
    lastContentId: -1,
    lastW: 0,
    texture,
  } as unknown as RendererData;
}

// Scale9 owns its texture directly (allocated in createData), so free it on teardown.
export function destroyGlScale9ShapeData(state: GlRenderState, data: RendererData): void {
  const { texture } = data as unknown as GlScale9ShapeData;
  state.gl.deleteTexture(texture);
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

  const shapeData = renderProxy.rendererData as unknown as GlScale9ShapeData;
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
    mapScale9ShapeCommands(_remappedCommands, commands, mapper);
    ctx.translate(-bounds.x, -bounds.y);
    rasterizer(ctx, _remappedCommands, state);
    ctx.restore();
    updateGlTexture(state, shapeData.texture, shapeData.canvas);
    shapeData.lastH = h;
    shapeData.lastScaleX = source.scaleX;
    shapeData.lastScaleY = source.scaleY;
    shapeData.lastContentId = version;
    shapeData.lastW = w;
  }

  useGlProgram(state);

  const gl = state.gl;
  if (runtime.currentTexture !== shapeData.texture) {
    gl.bindTexture(gl.TEXTURE_2D, shapeData.texture);
    runtime.currentTexture = shapeData.texture;
  }

  const { shaderLoc, matrixArray } = runtime;
  setGlBaseUniforms(gl, shaderLoc, renderProxy);

  const t = renderProxy.transform2D;
  setStrippedGlMatrixFromValues(
    gl,
    shaderLoc,
    matrixArray,
    t,
    source.scaleX,
    source.scaleY,
    runtime.renderTargetViewport ?? state.canvas,
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

function setStrippedGlMatrixFromValues(
  gl: WebGL2RenderingContext,
  loc: Parameters<typeof setGlMatrixFromValues>[1],
  m: Float32Array,
  t: Readonly<MatrixLike>,
  scaleX: number,
  scaleY: number,
  viewport: Readonly<{ width: number; height: number }>,
): void {
  const a = scaleX !== 0 ? t.a / scaleX : t.a;
  const b = scaleX !== 0 ? t.b / scaleX : t.b;
  const c = scaleY !== 0 ? t.c / scaleY : t.c;
  const d = scaleY !== 0 ? t.d / scaleY : t.d;
  setGlMatrixFromValues(gl, loc, m, a, b, c, d, t.tx, t.ty, viewport);
}
