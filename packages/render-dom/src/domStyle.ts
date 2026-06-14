import { hasRenderFeatures } from '@flighthq/render';
import { type DOMRenderState, RenderFeatures, type RenderNode2D } from '@flighthq/types';

import { getDOMCSSFilter } from './domCSSFilterBinding';
import { setDOMTransform } from './domTransform';
import type { DOMRenderStateInternal } from './internal';

export function applyDOMStyle(state: DOMRenderState, element: HTMLElement, node: RenderNode2D): void {
  setDOMTransform(element, node.transform2D, state.roundPixels);
  element.style.opacity = node.alpha < 1 ? String(node.alpha) : '';
  element.style.imageRendering = state.allowSmoothing ? '' : 'pixelated';
  if (hasRenderFeatures(state, RenderFeatures.CSSFilter)) element.style.filter = getDOMCSSFilter(node) ?? '';
  state.applyBlendMode?.(element, node.blendMode);
}

export function prepareDOMElement(element: HTMLElement): void {
  element.style.position = 'absolute';
  element.style.left = '0';
  element.style.top = '0';
  element.style.transformOrigin = '0 0';
  element.style.pointerEvents = 'none';
}

/**
 * Registers the element produced by a renderer for this draw call.
 * Placement into the container is always handled by the render loop, never by individual draw functions.
 */
export function setDOMRendererElement(state: DOMRenderState, element: HTMLElement): void {
  (state as DOMRenderStateInternal).domCurrentElement = element;
}
