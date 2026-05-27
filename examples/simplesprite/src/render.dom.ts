import type { Sprite } from '@flighthq/engine';
import {
  createDOMRenderState,
  defaultDOMSpriteRenderer,
  registerRenderer,
  renderDOMBackground,
  renderDOMSprite,
  SpriteKind,
} from '@flighthq/engine';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '400px';
document.body.appendChild(container);

export const state = createDOMRenderState(container, { backgroundColor: 0xeeddccff, imageSmoothingEnabled: false });
registerRenderer(state, SpriteKind, defaultDOMSpriteRenderer);
export const scale = 1;

export function render(root: Sprite): void {
  renderDOMBackground(state);
  renderDOMSprite(state, root);
}
