import { createEntity } from '@flighthq/entity';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import { hasRenderFeatures } from '@flighthq/render';
import { renderCanvasShapeCommands } from '@flighthq/render-canvas';
import type {
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  DOMRenderState,
  Renderable,
  RendererData,
  RenderState,
  Shape,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import { getDOMCSSFilter } from './domCSSFilterBinding';
import { prepareDOMElement, setDOMRendererElement } from './domStyle';
import { setDOMTransformWithOffset } from './domTransform';

interface DOMShapeData extends RendererData {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
}

function createDOMShapeData(_state: RenderState, _source: Renderable): DOMShapeData {
  return createEntity({ canvas: null, context: null });
}

export function drawDOMShape(state: DOMRenderState, renderNode: DisplayObjectRenderNode): void {
  const data = renderNode.rendererData as DOMShapeData | null;
  if (data === null) return;

  const source = renderNode.source as Shape;
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

  data.canvas.style.opacity = renderNode.alpha < 1 ? String(renderNode.alpha) : '';
  if (hasRenderFeatures(state, RenderFeatures.CSSFilter)) {
    data.canvas.style.filter = getDOMCSSFilter(renderNode) ?? '';
  }
  state.applyBlendMode?.(data.canvas, renderNode.blendMode);
  setDOMTransformWithOffset(data.canvas, renderNode.transform2D, bounds.x, bounds.y, state.roundPixels);

  setDOMRendererElement(state, data.canvas);
}

export function drawDOMShapeMask(state: DOMRenderState, renderNode: DisplayObjectRenderNode): void {
  drawDOMShape(state, renderNode);
}

export const defaultDOMShapeRenderer: DisplayObjectRenderer = {
  createData: createDOMShapeData,
  draw: drawDOMShape,
};
