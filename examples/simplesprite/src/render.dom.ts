import type { Sprite } from '@flighthq/sdk';
import {
  createDOMRenderState,
  defaultDOMSpriteRenderer,
  prepareDOMSpriteRender,
  registerRenderer,
  renderDOM,
  renderDOMBackground,
  SpriteKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '400px';
document.body.appendChild(container);

export const state = createDOMRenderState(container, { backgroundColor: 0xeeddccff, imageSmoothingEnabled: false });
registerRenderer(state, SpriteKind, defaultDOMSpriteRenderer);
export const scale = 1;

export function render(root: Sprite): void {
  if (!prepareDOMSpriteRender(state, root)) return;
  renderDOMBackground(state);
  renderDOM(state);
}
