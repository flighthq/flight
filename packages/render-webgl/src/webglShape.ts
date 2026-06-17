import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import { renderCanvasShapeCommands } from '@flighthq/render-canvas';
import type {
  DisplayObjectRenderer,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  Shape,
} from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { createWebGLTexture, drawWebGLQuad, updateWebGLTexture, useWebGLProgram } from './webglDraw';
import { setWebGLBaseUniforms, setWebGLMatrixFromValues } from './webglShader';

interface WebGLShapeData {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: WebGLTexture;
  lastVersion: number;
  lastW: number;
  lastH: number;
}

function createWebGLShapeData(state: RenderState, _source: Renderable): RendererData | null {
  const internal = state as WebGLRenderStateInternal;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  const texture = createWebGLTexture(internal);
  return { canvas, ctx, texture, lastVersion: -1, lastW: 0, lastH: 0 } as unknown as RendererData;
}

export function drawWebGLShape(state: RenderState, renderProxy: RenderProxy2D): void {
  const internal = state as WebGLRenderStateInternal;
  const source = renderProxy.source as Shape;
  const { commands, version } = source.data;
  if (commands.length === 0) return;
  if (renderProxy.rendererData === null) return;

  const shapeData = renderProxy.rendererData as unknown as WebGLShapeData;

  const bounds = getNodeLocalBoundsRectangle(source);
  const w = Math.ceil(bounds.width);
  const h = Math.ceil(bounds.height);
  if (w <= 0 || h <= 0) return;

  // Re-rasterise when commands changed or canvas size changed
  if (version !== shapeData.lastVersion || w !== shapeData.lastW || h !== shapeData.lastH) {
    shapeData.canvas.width = w;
    shapeData.canvas.height = h;
    const ctx = shapeData.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(-bounds.x, -bounds.y);
    renderCanvasShapeCommands(ctx, commands);
    ctx.restore();
    updateWebGLTexture(internal, shapeData.texture, shapeData.canvas);
    shapeData.lastVersion = version;
    shapeData.lastW = w;
    shapeData.lastH = h;
  }

  useWebGLProgram(internal);

  const gl = internal.gl;
  if (internal.currentTexture !== shapeData.texture) {
    gl.bindTexture(gl.TEXTURE_2D, shapeData.texture);
    internal.currentTexture = shapeData.texture;
  }

  const { shaderLoc, matrixArray } = internal;
  setWebGLBaseUniforms(gl, shaderLoc, renderProxy);

  const t = renderProxy.transform2D;
  setWebGLMatrixFromValues(
    gl,
    shaderLoc,
    matrixArray,
    t.a,
    t.b,
    t.c,
    t.d,
    t.tx + t.a * bounds.x + t.c * bounds.y,
    t.ty + t.b * bounds.x + t.d * bounds.y,
    internal.renderTargetViewport ?? internal.canvas,
  );

  drawWebGLQuad(internal, 0, 0, w, h, 0, 0, 1, 1);
}

export function drawWebGLShapeMask(state: RenderState, data: RenderProxy2D): void {
  drawWebGLShape(state, data);
}

export const defaultWebGLShapeRenderer: DisplayObjectRenderer = {
  createData: createWebGLShapeData,
  submit: drawWebGLShape,
};
