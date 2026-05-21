import { createNullRendererData } from '@flighthq/render-core';
import type {
  CanvasRenderState,
  CanvasShapeDrawState,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  Shape,
} from '@flighthq/types';

import { drawCanvasDisplayObject } from './canvasDisplayObject';
import { setCanvasBlendMode } from './canvasMaterials';
import { getCanvasShapeCommand } from './canvasShapeRegistry';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasShape(state: CanvasRenderState, renderNode: DisplayObjectRenderNode): void {
  drawCanvasDisplayObject(state, renderNode);

  const source = renderNode.source as Shape;
  const { commands } = source.data;
  if (commands.length === 0) return;

  const context = state.context;
  setCanvasBlendMode(state, renderNode.blendMode);
  context.globalAlpha = renderNode.alpha;
  setCanvasTransform(state, context, renderNode.transform2D);

  renderCanvasShapeCommands(context, commands);
}

export function renderCanvasShapeCommands(ctx: CanvasRenderingContext2D, commands: unknown[]): void {
  const drawState = createCanvasShapeDrawState(ctx);
  ctx.beginPath();
  let i = 0;
  while (i < commands.length) {
    const key = commands[i] as string;
    const argCount = commands[i + 1] as number;
    const def = getCanvasShapeCommand(key);
    if (def !== undefined) def.draw(ctx, drawState, commands, i + 2);
    i += argCount + 2;
  }
  if (drawState.hasPendingPath && (drawState.hasFill || drawState.hasStroke)) {
    flushCanvasShapePath(ctx, drawState);
  }
}

export const defaultCanvasShapeRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasShape,
  drawMask: drawCanvasShape,
};

function createCanvasShapeDrawState(ctx: CanvasRenderingContext2D): CanvasShapeDrawState {
  const state: CanvasShapeDrawState = {
    bitmapH: 0,
    bitmapSrc: null,
    bitmapW: 0,
    fillMatrix: null,
    fillMatrixInverse: null,
    fillStyle: '',
    hasFill: false,
    hasPendingPath: false,
    hasCurrentPoint: false,
    hasStroke: false,
    strokeStyle: '',
    strokeWidth: 1,
    windingRule: 'evenodd',
    flush: () => flushCanvasShapePath(ctx, state),
  };
  return state;
}

function flushCanvasShapePath(ctx: CanvasRenderingContext2D, state: CanvasShapeDrawState): void {
  if (state.hasFill) {
    ctx.fillStyle = state.fillStyle;
    if (state.fillMatrix !== null && state.fillMatrixInverse !== null) {
      const m = state.fillMatrix;
      const inv = state.fillMatrixInverse;
      ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
      ctx.fill(state.windingRule);
      ctx.transform(inv.a, inv.b, inv.c, inv.d, inv.tx, inv.ty);
    } else {
      ctx.fill(state.windingRule);
    }
  }
  if (state.hasStroke) {
    ctx.strokeStyle = state.strokeStyle;
    ctx.lineWidth = state.strokeWidth;
    ctx.stroke();
  }
  state.hasPendingPath = false;
  state.hasCurrentPoint = false;
  ctx.beginPath();
}
