import { noopRendererData } from '@flighthq/render';
import type { DisplayObjectRenderer, DOMRenderState, HTMLView, RenderProxy2D } from '@flighthq/types';

import { setDOMRendererElement } from './domStyle';
import { setDOMTransform } from './domTransform';

export function drawDOMHTMLView(state: DOMRenderState, renderProxy: RenderProxy2D): void {
  const source = renderProxy.source as HTMLView;
  const data = source.data;
  const element = data.element;
  if (element === null) return;

  if (element.style.position !== 'absolute') {
    element.style.left = '0';
    element.style.overflow = 'hidden';
    element.style.position = 'absolute';
    element.style.top = '0';
    element.style.transformOrigin = '0 0';
  }

  element.style.width = `${data.width}px`;
  element.style.height = `${data.height}px`;
  setDOMTransform(element, renderProxy.transform2D, state.roundPixels);
  element.style.opacity = renderProxy.alpha < 1 ? String(renderProxy.alpha) : '';
  state.applyBlendMode?.(element, renderProxy.blendMode);

  setDOMRendererElement(state, element);
}

export const defaultHTMLViewRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawDOMHTMLView,
};
