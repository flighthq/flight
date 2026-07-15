import type { DisplayObject } from '@flighthq/sdk';
import {
  ShapeKind,
  TextLabelKind,
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  defaultCanvasTextLabelRenderer,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
} from '@flighthq/sdk';

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

const pixelRatio = window.devicePixelRatio || 1;

export const canvas = createCanvasElement(CANVAS_WIDTH, CANVAS_HEIGHT, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x1a1a2eff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerRenderer(state, TextLabelKind, defaultCanvasTextLabelRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);

export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}
