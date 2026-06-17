import { noopRendererData } from '@flighthq/render';
import type { DisplayObjectRenderer, DOMRenderState, RenderNode2D, RenderView } from '@flighthq/types';

import { applyDOMStyle, setDOMRendererElement } from './domStyle';

export function drawDOMRenderView(state: DOMRenderState, renderNode: RenderNode2D): void {
  const source = renderNode.source as RenderView;
  const { renderer } = source.data;
  if (renderer === null) return;

  renderer.render();

  const canvas = renderer.canvas;
  if (canvas.style.position !== 'absolute') {
    canvas.style.left = '0';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.transformOrigin = '0 0';
    canvas.style.pointerEvents = 'none';
  }

  applyDOMStyle(state, canvas, renderNode);
  setDOMRendererElement(state, canvas);
}

export function drawDOMRenderViewMask(_state: DOMRenderState, _renderNode: RenderNode2D): void {}

export const defaultDOMRenderViewRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawDOMRenderView,
};
