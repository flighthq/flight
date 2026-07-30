import type { Node2D } from '@flighthq/sdk';
import {
  createDomRenderState,
  enableFlightDiagnostics,
  defaultCanvasShapeCommands,
  defaultDomShapeRenderer,
  defaultDomTextLabelRenderer,
  prepareScene2DRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderDomBackground,
  renderDomScene2D,
  ShapeKind,
  TextLabelKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '500px';
document.body.appendChild(container);

export const state = createDomRenderState(container, {
  backgroundColor: 0x1a1a2eff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
enableFlightDiagnostics(state);

registerRenderer(state, ShapeKind, defaultDomShapeRenderer);
registerRenderer(state, TextLabelKind, defaultDomTextLabelRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);

export const canvas: HTMLElement = container;

export const scale = 1;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderDomBackground(state);
  renderDomScene2D(state, root);
}
