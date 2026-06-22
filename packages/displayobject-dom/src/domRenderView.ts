import { noopRendererData } from '@flighthq/render';
import type { DisplayObjectRenderer, DomRenderState, RenderProxy2D, RenderView } from '@flighthq/types';

import { applyDomStyle, setDomRendererElement } from './domStyle';

export function drawDomRenderView(state: DomRenderState, renderProxy: RenderProxy2D): void {
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

  applyDomStyle(state, canvas, renderProxy);
  setDomRendererElement(state, canvas);
}

export const defaultDomRenderViewRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawDomRenderView,
};
