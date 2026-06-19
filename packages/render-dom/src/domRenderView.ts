import { noopRendererData } from '@flighthq/render';
import type { DisplayObjectRenderer, DOMRenderState, RenderProxy2D, RenderView } from '@flighthq/types';

import { applyDOMStyle, setDOMRendererElement } from './domStyle';

export function drawDOMRenderView(state: DOMRenderState, renderProxy: RenderProxy2D): void {
  const source = renderProxy.source as RenderView;
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

  applyDOMStyle(state, canvas, renderProxy);
  setDOMRendererElement(state, canvas);
}

export const defaultDOMRenderViewRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawDOMRenderView,
};
