import type { DOMRenderState, RenderNode2D } from '@flighthq/types';

import { setDOMBlendMode } from './domMaterials';
import { setDOMTransform } from './domTransform';

export function initDOMElement(element: HTMLElement): void {
  element.style.position = 'absolute';
  element.style.left = '0';
  element.style.top = '0';
  element.style.transformOrigin = '0 0';
  element.style.pointerEvents = 'none';
}

export function applyDOMStyle(state: DOMRenderState, element: HTMLElement, node: RenderNode2D): void {
  setDOMTransform(element, node.transform2D, state.roundPixels);
  element.style.opacity = node.alpha < 1 ? String(node.alpha) : '';
  element.style.imageRendering = state.allowSmoothing ? '' : 'pixelated';
  setDOMBlendMode(element, node.blendMode);
}
