import { createNullRendererData } from '@flighthq/render-core';
import type { DisplayObjectRenderer, DisplayObjectRenderNode, DOMElement, DOMRenderState } from '@flighthq/types';

import { setDOMBlendMode } from './domMaterials';
import { setDOMTransform } from './domTransform';

export function drawDOMElement(state: DOMRenderState, renderNode: DisplayObjectRenderNode): void {
  const source = renderNode.source as DOMElement;
  const element = source.data.element;
  if (element === null) return;

  if (element.style.position !== 'absolute') {
    element.style.position = 'absolute';
    element.style.left = '0';
    element.style.top = '0';
    element.style.transformOrigin = '0 0';
  }

  setDOMTransform(element, renderNode.transform2D, state.roundPixels);
  element.style.opacity = renderNode.alpha < 1 ? String(renderNode.alpha) : '';
  setDOMBlendMode(element, renderNode.blendMode);

  state.element.appendChild(element);
}

export function drawDOMElementMask(_state: DOMRenderState, _renderNode: DisplayObjectRenderNode): void {
  // Masking not yet supported in DOM renderer
}

export const defaultDOMElementRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawDOMElement,
  drawMask: drawDOMElementMask,
};
