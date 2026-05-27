import { rectangle } from '@flighthq/geometry';
import { createNullRendererData } from '@flighthq/render-core';
import { renderCanvasShapeCommands } from '@flighthq/render-canvas';
import { getDisplayObjectRuntime } from '@flighthq/scenegraph-display';
import type {
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  RendererData,
  Renderable,
  RenderState,
  Shape,
} from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { createWebGLTexture, drawWebGLQuad, updateWebGLTexture, useWebGLProgram } from './webglDraw';
import { setWebGLMatrixFromValues } from './webglShader';

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

const _tempBounds = rectangle.create();

export function drawWebGLShape(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const internal = state as WebGLRenderStateInternal;
  const source = renderNode.source as Shape;
  const { commands, version } = source.data;
  if (commands.length === 0) return;
  if (renderNode.rendererData === null) return;

  const shapeData = renderNode.rendererData as unknown as WebGLShapeData;

  // Use cached local bounds from the scene graph update; fall back to temp rect
  const runtime = getDisplayObjectRuntime(source);
  const bounds = runtime.localBoundsRect ?? _tempBounds;
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
  gl.uniform1f(shaderLoc.locAlpha, renderNode.alpha);
  gl.uniform1i(shaderLoc.locTexture, 0);

  const t = renderNode.transform2D;
  setWebGLMatrixFromValues(
    gl, shaderLoc, matrixArray,
    t.a, t.b, t.c, t.d,
    t.tx + t.a * bounds.x + t.c * bounds.y,
    t.ty + t.b * bounds.x + t.d * bounds.y,
    internal.canvas,
  );

  drawWebGLQuad(internal, 0, 0, w, h, 0, 0, 1, 1);
}

export function drawWebGLShapeMask(_state: RenderState, _data: DisplayObjectRenderNode): void {}

export const defaultWebGLShapeRenderer: DisplayObjectRenderer = {
  createData: createWebGLShapeData,
  draw: drawWebGLShape,
  drawMask: drawWebGLShapeMask,
};
