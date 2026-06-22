import type { DomRenderState, RenderProxy2D } from '@flighthq/types';

import { getDomRenderStateRuntime } from './domRenderState';
import { setDomTransform } from './domTransform';

export function applyDomStyle(state: DomRenderState, element: HTMLElement, node: RenderProxy2D): void {
  setDomTransform(element, node.transform2D, state.roundPixels);
  element.style.opacity = node.alpha < 1 ? String(node.alpha) : '';
  element.style.imageRendering = state.allowSmoothing ? '' : 'pixelated';
  if (state.domCssFilterResolver !== null) element.style.filter = state.domCssFilterResolver(node) ?? '';
  state.applyBlendMode?.(element, node.blendMode);
}

export function prepareDomElement(element: HTMLElement): void {
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
export function setDomRendererElement(state: DomRenderState, element: HTMLElement): void {
  getDomRenderStateRuntime(state).domCurrentElement = element;
}
