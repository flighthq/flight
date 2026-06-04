import type { DisplayObject } from '@flighthq/sdk';
import {
  createDOMRenderState,
  defaultDOMVideoRenderer,
  prepareDOMDisplayObjectRender,
  registerRenderer,
  renderDOM,
  renderDOMBackground,
  VideoKind,
} from '@flighthq/sdk';

const element = document.createElement('div');
element.style.position = 'relative';
element.style.width = `${window.innerWidth}px`;
element.style.height = `${window.innerHeight}px`;
document.body.style.margin = '0';
document.body.style.background = '#000';
document.body.appendChild(element);

export const container = element;
export const state = createDOMRenderState(element, { backgroundColor: 0x000000ff });
registerRenderer(state, VideoKind, defaultDOMVideoRenderer);
export const scale = 1;

export function render(root: DisplayObject): void {
  if (!prepareDOMDisplayObjectRender(state, root)) return;
  renderDOMBackground(state);
  renderDOM(state);
}

export function setSize(w: number, h: number): void {
  element.style.width = `${w}px`;
  element.style.height = `${h}px`;
}
