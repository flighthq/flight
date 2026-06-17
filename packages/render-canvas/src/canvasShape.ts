import { noopRendererData } from '@flighthq/render';
import type {
  CanvasRenderState,
  CanvasShapeDrawState,
  DisplayObjectRenderer,
  RenderNode2D,
  Shape,
} from '@flighthq/types';

import { drawCanvasDisplayObject } from './canvasDisplayObject';
import { getCanvasShapeCommand } from './canvasShapeRegistry';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasShape(state: CanvasRenderState, renderNode: RenderNode2D): void {
  drawCanvasDisplayObject(state, renderNode);

  const source = renderNode.source as Shape;
  const { commands } = source.data;
  if (commands.length === 0) return;

  const context = state.context;
  state.applyBlendMode?.(state, renderNode.blendMode);
  context.globalAlpha = renderNode.alpha;
  setCanvasTransform(state, context, renderNode.transform2D);

  renderCanvasShapeCommands(context, commands);
}

export function renderCanvasShapeCommands(context: CanvasRenderingContext2D, commands: unknown[]): void {
  const drawState = createCanvasShapeDrawState(context);
  context.beginPath();
  let i = 0;
  while (i < commands.length) {
    const key = commands[i] as string;
    const argCount = commands[i + 1] as number;
    const def = getCanvasShapeCommand(key);
    if (def !== undefined) def.draw(context, drawState, commands, i + 2);
    i += argCount + 2;
  }
  if (drawState.hasPendingPath && (drawState.hasFill || drawState.hasStroke)) {
    flushCanvasShapePath(context, drawState);
  }
}

export const defaultCanvasShapeRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawCanvasShape,
};

function createCanvasShapeDrawState(context: CanvasRenderingContext2D): CanvasShapeDrawState {
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
    flush: () => flushCanvasShapePath(context, state),
  };
  return state;
}

function flushCanvasShapePath(context: CanvasRenderingContext2D, state: CanvasShapeDrawState): void {
  if (state.hasFill) {
    context.fillStyle = state.fillStyle;
    if (state.fillMatrix !== null && state.fillMatrixInverse !== null) {
      const m = state.fillMatrix;
      const inv = state.fillMatrixInverse;
      context.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
      context.fill(state.windingRule);
      context.transform(inv.a, inv.b, inv.c, inv.d, inv.tx, inv.ty);
    } else {
      context.fill(state.windingRule);
    }
  }
  if (state.hasStroke) {
    context.strokeStyle = state.strokeStyle;
    context.lineWidth = state.strokeWidth;
    context.stroke();
  }
  state.hasPendingPath = false;
  state.hasCurrentPoint = false;
  context.beginPath();
}
