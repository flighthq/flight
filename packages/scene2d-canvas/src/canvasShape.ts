import { getRenderStateRuntime, noopRendererData } from '@flighthq/render/contract';
import type {
  CanvasRenderState,
  CanvasShapeDrawState,
  RenderState,
  Scene2DRenderer,
  RenderProxy2D,
  Shape,
} from '@flighthq/types/contract';

import { drawCanvasScene2D } from './canvasNode2D';
import { getCanvasShapeCommand } from './canvasShapeRegistry';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasShape(state: CanvasRenderState, renderProxy: RenderProxy2D): void {
  drawCanvasScene2D(state, renderProxy);

  const source = renderProxy.source as Shape;
  const { commands } = source.data;
  if (commands.length === 0) return;

  const context = state.context;
  state.applyBlendMode?.(state, renderProxy.blendMode);
  context.globalAlpha = renderProxy.alpha;
  setCanvasTransform(state, context, renderProxy.transform2D);

  renderCanvasShapeCommands(context, commands, state);
}

export function renderCanvasShapeCommands(
  context: CanvasRenderingContext2D,
  commands: unknown[],
  state: CanvasRenderState | null = null,
  registryState: RenderState | null = state,
): void {
  const drawState = createCanvasShapeDrawState(context, state);
  context.beginPath();
  let i = 0;
  while (i < commands.length) {
    const key = commands[i] as string;
    const argCount = commands[i + 1] as number;
    const def = getCanvasShapeCommand(key);
    if (def !== undefined) def.draw(context, drawState, commands, i + 2);
    else {
      if (registryState !== null) getRenderStateRuntime(registryState).registryMiss?.(2, key);
    }
    i += argCount + 2;
  }
  if (drawState.hasPendingPath && (drawState.hasFill || drawState.hasStroke)) {
    flushCanvasShapePath(context, drawState);
  }
}

export const defaultCanvasShapeRenderer: Scene2DRenderer = {
  createData: noopRendererData,
  submit: drawCanvasShape,
};

function createCanvasShapeDrawState(
  context: CanvasRenderingContext2D,
  renderState: CanvasRenderState | null,
): CanvasShapeDrawState {
  const state: CanvasShapeDrawState = {
    bitmapH: 0,
    bitmapSrc: null,
    bitmapW: 0,
    canvasRenderState: renderState,
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
