import { createNullRendererData } from '@flighthq/render';
import type { DisplayObjectRenderer, DisplayObjectRenderNode, DOMRenderState, HTMLView } from '@flighthq/types';

import { setDOMRendererElement } from './domStyle';
import { setDOMTransform } from './domTransform';

export function drawHTMLView(state: DOMRenderState, renderNode: DisplayObjectRenderNode): void {
  const source = renderNode.source as HTMLView;
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
  setDOMTransform(element, renderNode.transform2D, state.roundPixels);
  element.style.opacity = renderNode.alpha < 1 ? String(renderNode.alpha) : '';
  state.applyBlendMode?.(element, renderNode.blendMode);

  setDOMRendererElement(state, element);
}

export function drawHTMLViewMask(_state: DOMRenderState, _renderNode: DisplayObjectRenderNode): void {
  // HTMLView content is not converted into mask geometry by the DOM renderer.
}

export const defaultHTMLViewRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawHTMLView,
};
