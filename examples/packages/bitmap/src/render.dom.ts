import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createDomRenderState,
  defaultDomBitmapRenderer,
  prepareDisplayObjectRender,
  registerRenderer,
  renderDomBackground,
  renderDomDisplayObject,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '500px';
document.body.appendChild(container);

export const state = createDomRenderState(container, {
  backgroundColor: 0xf0f0f0ff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerRenderer(state, BitmapKind, defaultDomBitmapRenderer);

export const canvas: HTMLElement = container;

export const scale = 1;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDomBackground(state);
  renderDomDisplayObject(state, root);
}
