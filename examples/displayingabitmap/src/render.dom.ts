import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createDOMRenderState,
  defaultDOMBitmapRenderer,
  prepareDOMDisplayObjectRender,
  registerRenderer,
  renderDOM,
  renderDOMBackground,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '550px';
container.style.height = '400px';
document.body.appendChild(container);

export const state = createDOMRenderState(container, {
  backgroundColor: 0xeeddccff,
});

registerRenderer(state, BitmapKind, defaultDOMBitmapRenderer);

export const scale = 1;

export function render(root: DisplayObject): void {
  if (!prepareDOMDisplayObjectRender(state, root)) return;
  renderDOMBackground(state);
  renderDOM(state);
}
