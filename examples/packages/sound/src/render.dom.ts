import type { DisplayObject } from '@flighthq/sdk';
import {
  createDomRenderState,
  defaultCanvasShapeCommands,
  defaultDomShapeRenderer,
  defaultDomTextLabelRenderer,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderDomBackground,
  renderDomDisplayObject,
  ShapeKind,
  TextLabelKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '600px';
document.body.appendChild(container);

export const state = createDomRenderState(container, {
  backgroundColor: 0x1a1a2eff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerRenderer(state, ShapeKind, defaultDomShapeRenderer);
registerRenderer(state, TextLabelKind, defaultDomTextLabelRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);

export const scale = 1;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDomBackground(state);
  renderDomDisplayObject(state, root);
}
