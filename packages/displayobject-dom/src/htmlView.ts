import { noopRendererData } from '@flighthq/render';
import type { DisplayObjectRenderer, DomRenderState, HtmlView, RenderProxy2D } from '@flighthq/types';

import { setDomRendererElement } from './domStyle';
import { setDomTransform } from './domTransform';

export function drawDomHtmlView(state: DomRenderState, renderProxy: RenderProxy2D): void {
  const source = renderProxy.source as HtmlView;
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
  setDomTransform(element, renderProxy.transform2D, state.roundPixels);
  element.style.opacity = renderProxy.alpha < 1 ? String(renderProxy.alpha) : '';
  state.applyBlendMode?.(element, renderProxy.blendMode);

  setDomRendererElement(state, element);
}

export const defaultHtmlViewRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawDomHtmlView,
};
