import type { DisplayObject } from '@flighthq/engine';
import {
  createDOMRenderState,
  defaultCanvasShapeCommands,
  defaultDOMShapeRenderer,
  registerCanvasShapeCommands,
  registerRenderer,
  renderDOMBackground,
  renderDOMDisplayObject,
  ShapeKind,
} from '@flighthq/engine';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '400px';
document.body.appendChild(container);

export const state = createDOMRenderState(container, { backgroundColor: 0xffffffff });
registerRenderer(state, ShapeKind, defaultDOMShapeRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);
export const scale = 1;

export function render(root: DisplayObject): void {
  renderDOMBackground(state);
  renderDOMDisplayObject(state, root);
}
