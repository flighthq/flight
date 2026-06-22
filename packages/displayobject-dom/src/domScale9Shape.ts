import { mapCanvasScale9ShapeCommands, renderCanvasShapeCommands } from '@flighthq/displayobject-canvas';
import { createEntity } from '@flighthq/entity';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import type {
  DisplayObjectRenderer,
  DomRenderState,
  MatrixLike,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  Scale9Shape,
} from '@flighthq/types';

import { buildDomScale9Mapper } from './domScale9Mapper';
import { drawDomShape } from './domShape';
import { prepareDomElement, setDomRendererElement } from './domStyle';

interface DomScale9ShapeData extends RendererData {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
}

const _remappedCommands: unknown[] = [];

export function createDomScale9ShapeData(_state: RenderState, _source: Renderable): DomScale9ShapeData {
  return createEntity({ canvas: null, context: null });
}

export function drawDomScale9Shape(state: DomRenderState, renderProxy: RenderProxy2D): void {
  const data = renderProxy.rendererData as DomScale9ShapeData | null;
  if (data === null) return;

  const source = renderProxy.source as Scale9Shape;
  const { commands, scale9Grid } = source.data;
  if (commands.length === 0) return;

  const bounds = getNodeLocalBoundsRectangle(source);
  const mapper = buildDomScale9Mapper(bounds, scale9Grid, source.scaleX, source.scaleY);
  if (mapper === null) {
    drawDomShape(state, renderProxy);
    return;
  }

  if (data.canvas === null) {
    data.canvas = document.createElement('canvas');
    data.context = data.canvas.getContext('2d');
    prepareDomElement(data.canvas);
  }

  const w = Math.max(1, Math.ceil(bounds.width * source.scaleX));
  const h = Math.max(1, Math.ceil(bounds.height * source.scaleY));

  data.canvas.width = w;
  data.canvas.height = h;

  const ctx = data.context!;
  mapCanvasScale9ShapeCommands(_remappedCommands, commands, mapper);
  if (bounds.x !== 0 || bounds.y !== 0) {
    ctx.translate(-bounds.x, -bounds.y);
  }
  renderCanvasShapeCommands(ctx, _remappedCommands);

  data.canvas.style.opacity = renderProxy.alpha < 1 ? String(renderProxy.alpha) : '';
  data.canvas.style.imageRendering = state.allowSmoothing ? '' : 'pixelated';
  state.applyBlendMode?.(data.canvas, renderProxy.blendMode);
  setStrippedDomTransform(data.canvas, renderProxy.transform2D, source.scaleX, source.scaleY, state.roundPixels);
  setDomRendererElement(state, data.canvas);
}

export const defaultDomScale9ShapeRenderer: DisplayObjectRenderer = {
  createData: createDomScale9ShapeData,
  submit: drawDomScale9Shape,
};

function setStrippedDomTransform(
  element: HTMLElement,
  transform: Readonly<MatrixLike>,
  scaleX: number,
  scaleY: number,
  roundPixels: boolean,
): void {
  const a = scaleX !== 0 ? transform.a / scaleX : transform.a;
  const b = scaleX !== 0 ? transform.b / scaleX : transform.b;
  const c = scaleY !== 0 ? transform.c / scaleY : transform.c;
  const d = scaleY !== 0 ? transform.d / scaleY : transform.d;
  const tx = roundPixels ? Math.fround(transform.tx) : transform.tx;
  const ty = roundPixels ? Math.fround(transform.ty) : transform.ty;
  element.style.transform = `matrix(${a},${b},${c},${d},${tx},${ty})`;
}
