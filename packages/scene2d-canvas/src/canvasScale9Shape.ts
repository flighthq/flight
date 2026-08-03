import { noopRendererData } from '@flighthq/render/contract';
import { mapScale9ShapeCommands } from '@flighthq/shape/contract';
import type {
  CanvasRenderState,
  MatrixLike,
  RenderProxy2D,
  Scale9Shape,
  Scene2DRenderer,
  ShapeCommandToken,
} from '@flighthq/types/contract';

import { drawCanvasScene2D } from './canvasNode2D';
import { getCanvasRenderStateTextureResolvers } from './canvasRenderState';
import { buildScale9Mapper } from './canvasScale9Mapper';
import { renderCanvasShapeCommands } from './canvasShape';
import { setCanvasTransform } from './canvasTransform';

const _remappedCommands: ShapeCommandToken[] = [];

export function drawCanvasScale9Shape(state: CanvasRenderState, renderProxy: RenderProxy2D): void {
  drawCanvasScene2D(state, renderProxy);

  const source = renderProxy.source as Scale9Shape;
  const { commands, scale9Grid } = source.data;
  if (commands.length === 0) return;

  const context = state.context;
  state.applyBlendMode?.(state, renderProxy.blendMode);
  context.globalAlpha = renderProxy.alpha;

  const { scaleX, scaleY } = source;
  const mapper = buildScale9Mapper(commands, scale9Grid, scaleX, scaleY);

  if (mapper === null) {
    setCanvasTransform(state, context, renderProxy.transform2D);
    renderCanvasShapeCommands(context, state, commands, getCanvasRenderStateTextureResolvers(state));
  } else {
    applyStrippedTransform(state, context, renderProxy.transform2D, scaleX, scaleY);
    mapScale9ShapeCommands(_remappedCommands, commands, mapper);
    renderCanvasShapeCommands(context, state, _remappedCommands, getCanvasRenderStateTextureResolvers(state));
  }
}

export const defaultCanvasScale9ShapeRenderer: Scene2DRenderer = {
  createData: noopRendererData,
  submit: drawCanvasScale9Shape,
};

function applyStrippedTransform(
  state: CanvasRenderState,
  context: CanvasRenderingContext2D,
  t: Readonly<MatrixLike>,
  scaleX: number,
  scaleY: number,
): void {
  const a = scaleX !== 0 ? t.a / scaleX : t.a;
  const b = scaleX !== 0 ? t.b / scaleX : t.b;
  const c = scaleY !== 0 ? t.c / scaleY : t.c;
  const d = scaleY !== 0 ? t.d / scaleY : t.d;
  if (state.roundPixels) {
    context.setTransform(a, b, c, d, Math.fround(t.tx), Math.fround(t.ty));
  } else {
    context.setTransform(a, b, c, d, t.tx, t.ty);
  }
}
