import { createEntity } from '@flighthq/entity';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import { mapScale9ShapeCommands, renderCanvasShapeCommands } from '@flighthq/render-canvas';
import type {
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  DOMRenderState,
  MatrixLike,
  Renderable,
  RendererData,
  RenderState,
  Scale9Shape,
} from '@flighthq/types';

import { buildDOMScale9Mapper } from './domScale9Mapper';
import { drawDOMShape } from './domShape';
import { prepareDOMElement, setDOMRendererElement } from './domStyle';

interface DOMScale9ShapeData extends RendererData {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
}

const _remappedCommands: unknown[] = [];

export function createDOMScale9ShapeData(_state: RenderState, _source: Renderable): DOMScale9ShapeData {
  return createEntity({ canvas: null, context: null });
}

export function drawDOMScale9Shape(state: DOMRenderState, renderNode: DisplayObjectRenderNode): void {
  const data = renderNode.rendererData as DOMScale9ShapeData | null;
  if (data === null) return;

  const source = renderNode.source as Scale9Shape;
  const { commands, scale9Grid } = source.data;
  if (commands.length === 0) return;

  const bounds = getNodeLocalBoundsRectangle(source);
  const mapper = buildDOMScale9Mapper(bounds, scale9Grid, source.scaleX, source.scaleY);
  if (mapper === null) {
    drawDOMShape(state, renderNode);
    return;
  }

  if (data.canvas === null) {
    data.canvas = document.createElement('canvas');
    data.context = data.canvas.getContext('2d');
    prepareDOMElement(data.canvas);
  }

  const w = Math.max(1, Math.ceil(bounds.width * source.scaleX));
  const h = Math.max(1, Math.ceil(bounds.height * source.scaleY));

  data.canvas.width = w;
  data.canvas.height = h;

  const ctx = data.context!;
  mapScale9ShapeCommands(_remappedCommands, commands, mapper);
  if (bounds.x !== 0 || bounds.y !== 0) {
    ctx.translate(-bounds.x, -bounds.y);
  }
  renderCanvasShapeCommands(ctx, _remappedCommands);

  data.canvas.style.opacity = renderNode.alpha < 1 ? String(renderNode.alpha) : '';
  data.canvas.style.imageRendering = state.allowSmoothing ? '' : 'pixelated';
  state.applyBlendMode?.(data.canvas, renderNode.blendMode);
  setStrippedDOMTransform(data.canvas, renderNode.transform2D, source.scaleX, source.scaleY, state.roundPixels);
  setDOMRendererElement(state, data.canvas);
}

export function drawDOMScale9ShapeMask(state: DOMRenderState, renderNode: DisplayObjectRenderNode): void {
  drawDOMScale9Shape(state, renderNode);
}

export const defaultDOMScale9ShapeRenderer: DisplayObjectRenderer = {
  createData: createDOMScale9ShapeData,
  submit: drawDOMScale9Shape,
};

function setStrippedDOMTransform(
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
