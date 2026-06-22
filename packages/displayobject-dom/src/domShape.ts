import { renderCanvasShapeCommands } from '@flighthq/displayobject-canvas';
import { createEntity } from '@flighthq/entity';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import type {
  DisplayObjectRenderer,
  DomRenderState,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  Shape,
} from '@flighthq/types';

import { prepareDomElement, setDomRendererElement } from './domStyle';
import { setDomTransformWithOffset } from './domTransform';

interface DomShapeData extends RendererData {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
}

function createDomShapeData(_state: RenderState, _source: Renderable): DomShapeData {
  return createEntity({ canvas: null, context: null });
}

export function drawDomShape(state: DomRenderState, renderProxy: RenderProxy2D): void {
  const data = renderProxy.rendererData as DomShapeData | null;
  if (data === null) return;

  const source = renderProxy.source as Shape;
  const { commands } = source.data;
  if (commands.length === 0) return;

  if (data.canvas === null) {
    data.canvas = document.createElement('canvas');
    data.context = data.canvas.getContext('2d');
    prepareDomElement(data.canvas);
  }

  const bounds = getNodeLocalBoundsRectangle(source);
  const w = Math.max(1, Math.ceil(bounds.width));
  const h = Math.max(1, Math.ceil(bounds.height));

  // Resizing clears the canvas and resets context state
  data.canvas.width = w;
  data.canvas.height = h;

  const ctx = data.context!;
  if (bounds.x !== 0 || bounds.y !== 0) {
    ctx.translate(-bounds.x, -bounds.y);
  }

  renderCanvasShapeCommands(ctx, commands);

  data.canvas.style.opacity = renderProxy.alpha < 1 ? String(renderProxy.alpha) : '';
  if (state.domCssFilterResolver !== null) {
    data.canvas.style.filter = state.domCssFilterResolver(renderProxy) ?? '';
  }
  state.applyBlendMode?.(data.canvas, renderProxy.blendMode);
  setDomTransformWithOffset(data.canvas, renderProxy.transform2D, bounds.x, bounds.y, state.roundPixels);

  setDomRendererElement(state, data.canvas);
}

export const defaultDomShapeRenderer: DisplayObjectRenderer = {
  createData: createDomShapeData,
  submit: drawDomShape,
};
