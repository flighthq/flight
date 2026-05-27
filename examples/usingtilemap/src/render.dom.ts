import type { Tilemap } from '@flighthq/engine';
import {
  createDOMRenderState,
  defaultDOMTilemapRenderer,
  registerRenderer,
  renderDOMBackground,
  renderDOMSprite,
  TilemapKind,
} from '@flighthq/engine';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '592px';
container.style.height = '592px';
document.getElementById('app')!.appendChild(container);

export const state = createDOMRenderState(container, { backgroundColor: 0xeeddccff, imageSmoothingEnabled: false });
registerRenderer(state, TilemapKind, defaultDOMTilemapRenderer);
export const scale = 1;

export function render(root: Tilemap): void {
  renderDOMBackground(state);
  renderDOMSprite(state, root);
}
