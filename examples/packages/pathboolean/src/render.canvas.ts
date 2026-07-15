import type { DisplayObject } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasBeginFill,
  defaultCanvasDrawPath,
  defaultCanvasEndFill,
  defaultCanvasLineStyle,
  defaultCanvasLineTo,
  defaultCanvasMoveTo,
  defaultCanvasShapeRenderer,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  ShapeKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xffffffff,
});
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands([
  defaultCanvasBeginFill,
  defaultCanvasDrawPath,
  defaultCanvasEndFill,
  defaultCanvasLineStyle,
  defaultCanvasLineTo,
  defaultCanvasMoveTo,
]);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}
