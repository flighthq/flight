import { createEntity } from '@flighthq/entity';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import { renderCanvasShapeCommands } from '@flighthq/render-canvas';
import type {
  DisplayObjectRenderer,
  DOMRenderState,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  Shape,
} from '@flighthq/types';

import { prepareDOMElement, setDOMRendererElement } from './domStyle';
import { setDOMTransformWithOffset } from './domTransform';

interface DOMShapeData extends RendererData {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
}

function createDOMShapeData(_state: RenderState, _source: Renderable): DOMShapeData {
  return createEntity({ canvas: null, context: null });
}

export function drawDOMShape(state: DOMRenderState, renderProxy: RenderProxy2D): void {
  const data = renderProxy.rendererData as DOMShapeData | null;
  if (data === null) return;

  const source = renderProxy.source as Shape;
  const { commands } = source.data;
  if (commands.length === 0) return;

  if (data.canvas === null) {
    data.canvas = document.createElement('canvas');
    data.context = data.canvas.getContext('2d');
    prepareDOMElement(data.canvas);
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
  if (state.domCSSFilterResolver !== null) {
    data.canvas.style.filter = state.domCSSFilterResolver(renderProxy) ?? '';
  }
  state.applyBlendMode?.(data.canvas, renderProxy.blendMode);
  setDOMTransformWithOffset(data.canvas, renderProxy.transform2D, bounds.x, bounds.y, state.roundPixels);

  setDOMRendererElement(state, data.canvas);
}

export function drawDOMShapeMask(state: DOMRenderState, renderProxy: RenderProxy2D): void {
  drawDOMShape(state, renderProxy);
}

export const defaultDOMShapeRenderer: DisplayObjectRenderer = {
  createData: createDOMShapeData,
  submit: drawDOMShape,
};
