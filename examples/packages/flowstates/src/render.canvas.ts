import type { DisplayObject } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasBeginFill,
  defaultCanvasDrawRectangle,
  defaultCanvasShapeRenderer,
  defaultCanvasTextLabelRenderer,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  ShapeKind,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(600, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0x222222ff,
});

registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerRenderer(state, TextLabelKind, defaultCanvasTextLabelRenderer);
registerCanvasShapeCommands([defaultCanvasBeginFill, defaultCanvasDrawRectangle]);

export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}
