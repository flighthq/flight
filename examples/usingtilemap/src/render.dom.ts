import type { Tilemap } from '@flighthq/sdk';
import {
  createDOMRenderState,
  defaultDOMTilemapRenderer,
  prepareSpriteRender,
  registerRenderer,
  renderDOMBackground,
  renderDOMSprite,
  TilemapKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '592px';
container.style.height = '592px';
document.getElementById('app')!.appendChild(container);

export const state = createDOMRenderState(container, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xeeddccff,
  imageSmoothingEnabled: false,
});
registerRenderer(state, TilemapKind, defaultDOMTilemapRenderer);
export const scale = 1;

export function render(root: Tilemap): void {
  if (!prepareSpriteRender(state, root)) return;
  renderDOMBackground(state);
  renderDOMSprite(state, root);
}
