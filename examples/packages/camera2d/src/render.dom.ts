import type { Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  TextLabelKind,
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
} from '@flighthq/sdk';

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = CANVAS_WIDTH + 'px';
container.style.height = CANVAS_HEIGHT + 'px';
document.body.appendChild(container);

export const canvas = container;

export const state = createDomRenderState(container, {
  backgroundColor: 0x1a1a2eff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
enableFlightDiagnostics(state);

registerRenderer(state, ShapeKind, defaultDomShapeRenderer);
registerRenderer(state, TextLabelKind, defaultDomTextLabelRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);

export const scale = 1;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderDomBackground(state);
  renderDomScene2D(state, root);
}
