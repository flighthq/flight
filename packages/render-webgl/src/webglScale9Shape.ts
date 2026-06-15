import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import { mapCanvasScale9ShapeCommands, renderCanvasShapeCommands } from '@flighthq/render-canvas';
import type {
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  MatrixLike,
  Renderable,
  RendererData,
  RenderState,
  Scale9Shape,
} from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { createWebGLTexture, drawWebGLQuad, updateWebGLTexture, useWebGLProgram } from './webglDraw';
import { buildWebGLScale9Mapper } from './webglScale9Mapper';
import { setWebGLBaseUniforms, setWebGLMatrixFromValues } from './webglShader';
import { drawWebGLShape } from './webglShape';

interface WebGLScale9ShapeData {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lastH: number;
  lastScaleX: number;
  lastScaleY: number;
  lastVersion: number;
  lastW: number;
  texture: WebGLTexture;
}

const _remappedCommands: unknown[] = [];
const _remappedPathData: number[] = [];

export function createWebGLScale9ShapeData(state: RenderState, _source: Renderable): RendererData | null {
  const internal = state as WebGLRenderStateInternal;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  const texture = createWebGLTexture(internal);
  return {
    canvas,
    ctx,
    lastH: 0,
    lastScaleX: -1,
    lastScaleY: -1,
    lastVersion: -1,
    lastW: 0,
    texture,
  } as unknown as RendererData;
}

export function drawWebGLScale9Shape(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const internal = state as WebGLRenderStateInternal;
  const source = renderNode.source as Scale9Shape;
  const { commands, scale9Grid, version } = source.data;
  if (commands.length === 0) return;
  if (renderNode.rendererData === null) return;

  const bounds = getNodeLocalBoundsRectangle(source);
  const mapper = buildWebGLScale9Mapper(bounds, scale9Grid, source.scaleX, source.scaleY);
  if (mapper === null) {
    drawWebGLShape(state, renderNode);
    return;
  }

  const shapeData = renderNode.rendererData as unknown as WebGLScale9ShapeData;
  const w = Math.ceil(bounds.width * source.scaleX);
  const h = Math.ceil(bounds.height * source.scaleY);
  if (w <= 0 || h <= 0) return;

  if (
    version !== shapeData.lastVersion ||
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
    remapWebGLScale9Commands(_remappedCommands, commands, mapper);
    ctx.translate(-bounds.x, -bounds.y);
    renderCanvasShapeCommands(ctx, _remappedCommands);
    ctx.restore();
    updateWebGLTexture(internal, shapeData.texture, shapeData.canvas);
    shapeData.lastH = h;
    shapeData.lastScaleX = source.scaleX;
    shapeData.lastScaleY = source.scaleY;
    shapeData.lastVersion = version;
    shapeData.lastW = w;
  }

  useWebGLProgram(internal);

  const gl = internal.gl;
  if (internal.currentTexture !== shapeData.texture) {
    gl.bindTexture(gl.TEXTURE_2D, shapeData.texture);
    internal.currentTexture = shapeData.texture;
  }

  const { shaderLoc, matrixArray } = internal;
  setWebGLBaseUniforms(gl, shaderLoc, renderNode);

  const t = renderNode.transform2D;
  setStrippedWebGLMatrixFromValues(
    gl,
    shaderLoc,
    matrixArray,
    t,
    source.scaleX,
    source.scaleY,
    internal.renderTargetViewport ?? internal.canvas,
  );

  drawWebGLQuad(internal, 0, 0, w, h, 0, 0, 1, 1);
}

export function drawWebGLScale9ShapeMask(state: RenderState, data: DisplayObjectRenderNode): void {
  drawWebGLScale9Shape(state, data);
}

export function remapWebGLScale9Commands(
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

export const defaultWebGLScale9ShapeRenderer: DisplayObjectRenderer = {
  createData: createWebGLScale9ShapeData,
  submit: drawWebGLScale9Shape,
};

function setStrippedWebGLMatrixFromValues(
  gl: WebGL2RenderingContext,
  loc: Parameters<typeof setWebGLMatrixFromValues>[1],
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
  setWebGLMatrixFromValues(gl, loc, m, a, b, c, d, t.tx, t.ty, viewport);
}
