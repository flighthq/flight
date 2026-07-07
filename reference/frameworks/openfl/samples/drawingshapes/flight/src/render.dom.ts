import type { DisplayObject } from '@flighthq/sdk';
import {
  createDomRenderState,
  defaultCanvasBeginFill,
  defaultCanvasCurveTo,
  defaultCanvasDrawCircle,
  defaultCanvasDrawEllipse,
  defaultCanvasDrawRectangle,
  defaultCanvasDrawRoundRectangle,
  defaultCanvasLineStyle,
  defaultCanvasLineTo,
  defaultCanvasMoveTo,
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
container.style.width = '800px';
container.style.height = '400px';
document.body.appendChild(container);

export const state = createDomRenderState(container, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xffffffff,
});
registerRenderer(state, ShapeKind, defaultDomShapeRenderer);
registerCanvasShapeCommands([
  defaultCanvasBeginFill,
  defaultCanvasCurveTo,
  defaultCanvasDrawCircle,
  defaultCanvasDrawEllipse,
  defaultCanvasDrawRectangle,
  defaultCanvasDrawRoundRectangle,
  defaultCanvasLineStyle,
  defaultCanvasLineTo,
  defaultCanvasMoveTo,
]);
export const scale = 1;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDomBackground(state);
  renderDomDisplayObject(state, root);
}
