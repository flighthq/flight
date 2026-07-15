import type { DisplayObject } from '@flighthq/sdk';
import {
  createDomRenderState,
  defaultCanvasShapeCommands,
  defaultDomShapeRenderer,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderDomBackground,
  renderDomDisplayObject,
  ShapeKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '600px';
container.style.height = '400px';
document.body.appendChild(container);

export const state = createDomRenderState(container, {
  backgroundColor: 0xf5f5f5ff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerRenderer(state, ShapeKind, defaultDomShapeRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);

export const scale = 1;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDomBackground(state);
  renderDomDisplayObject(state, root);
}
