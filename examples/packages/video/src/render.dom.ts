import type { Node2D } from '@flighthq/sdk';
import {
  createDomRenderState,
  defaultDomSpriteRenderer,
  enableFlightDiagnostics,
  prepareScene2DRender,
  registerDomImageTextureResolver,
  registerRenderer,
  renderDomScene2D,
  SpriteKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '500px';
document.body.appendChild(container);

export const state = createDomRenderState(container, { sceneGraphSyncPolicy: 'requiresInvalidation' });
// DOM has no pass and no clear: the background is a CSS property on the element the caller
// already holds, set once rather than reapplied by a render function every frame.
container.style.backgroundColor = '#1a1a2e';
enableFlightDiagnostics(state);

registerRenderer(state, SpriteKind, defaultDomSpriteRenderer);
registerDomImageTextureResolver(state);

export const canvas: HTMLElement = container;

export const scale = 1;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderDomScene2D(state, root);
}
