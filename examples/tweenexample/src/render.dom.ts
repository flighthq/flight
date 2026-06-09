import type { DisplayObject } from '@flighthq/sdk';
import {
  createDOMRenderState,
  defaultCanvasBeginFill,
  defaultCanvasDrawCircle,
  defaultCanvasEndFill,
  defaultDOMShapeRenderer,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderDOMBackground,
  renderDOMDisplayObject,
  ShapeKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '550px';
container.style.height = '400px';
document.body.appendChild(container);

export const state = createDOMRenderState(container, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xeeddccff,
});
registerRenderer(state, ShapeKind, defaultDOMShapeRenderer);
registerCanvasShapeCommands([defaultCanvasBeginFill, defaultCanvasEndFill, defaultCanvasDrawCircle]);
export const scale = 1;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDOMBackground(state);
  renderDOMDisplayObject(state, root);
}
