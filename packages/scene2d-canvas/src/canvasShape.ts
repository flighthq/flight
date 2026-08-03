import { getRenderStateRuntime, noopRendererData } from '@flighthq/render/contract';
import type {
  CanvasRenderState,
  CanvasShapeDrawState,
  CanvasTextureResolvers,
  RenderProxy2D,
  RenderState,
  Scene2DRenderer,
  Shape,
} from '@flighthq/types/contract';
import { RenderRegistry } from '@flighthq/types/contract';

import { drawCanvasScene2D } from './canvasNode2D';
import { getCanvasRenderStateTextureResolvers } from './canvasRenderState';
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

  renderCanvasShapeCommands(context, state, commands, getCanvasRenderStateTextureResolvers(state));
}

// `state` carries the command registry and the smoothing policy, and is where an unhandled command key
// is reported — which is why it is required rather than an optional diagnostic tag. `resolvers` stays a
// separate argument because it is not the state's: a GPU or DOM backend rasterizes through a Canvas
// resolver set its own state has no place to hold.
export function renderCanvasShapeCommands(
  context: CanvasRenderingContext2D,
  state: RenderState,
  commands: unknown[],
  resolvers: CanvasTextureResolvers,
): void {
  const drawState = createCanvasShapeDrawState(context, resolvers, state.allowSmoothing);
  context.beginPath();
  let i = 0;
  while (i < commands.length) {
    const key = commands[i] as string;
    const argCount = commands[i + 1] as number;
    const def = getCanvasShapeCommand(state, key);
    if (def !== null) def.draw(context, drawState, commands, i + 2);
    else getRenderStateRuntime(state).registryMiss?.(RenderRegistry.ShapeCommandHandler, key);
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

// MorphShape has its own node kind but the same retained command stream and invalidation semantics.
export const defaultCanvasMorphShapeRenderer: Scene2DRenderer = defaultCanvasShapeRenderer;

function createCanvasShapeDrawState(
  context: CanvasRenderingContext2D,
  resolvers: CanvasTextureResolvers,
  allowSmoothing: boolean,
): CanvasShapeDrawState {
  const state: CanvasShapeDrawState = {
    allowSmoothing,
    bitmapH: 0,
    bitmapSrc: null,
    bitmapW: 0,
    canvasTextureResolvers: resolvers,
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
