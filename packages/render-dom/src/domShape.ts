import { createEntity } from '@flighthq/entity';
import { renderCanvasShapeCommands } from '@flighthq/render-canvas';
import { getLocalBoundsRect } from '@flighthq/scenegraph-core';
import type {
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  DOMRenderState,
  Renderable,
  RendererData,
  RenderState,
  Shape,
} from '@flighthq/types';

import { setDOMBlendMode } from './domMaterials';
import { initDOMElement } from './domStyle';
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
    initDOMElement(data.canvas);
  }

  const bounds = getLocalBoundsRect(source);
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
  setDOMBlendMode(data.canvas, renderNode.blendMode);
  setDOMTransformWithOffset(data.canvas, renderNode.transform2D, bounds.x, bounds.y, state.roundPixels);

  state.element.appendChild(data.canvas);
}

export function drawDOMShapeMask(_state: DOMRenderState, _renderNode: DisplayObjectRenderNode): void {
  // Masking not yet supported in DOM renderer
}

export const defaultDOMShapeRenderer: DisplayObjectRenderer = {
  createData: createDOMShapeData,
  draw: drawDOMShape,
  drawMask: drawDOMShapeMask,
};
