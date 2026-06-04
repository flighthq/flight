import type { DisplayObject } from '@flighthq/sdk';
import {
  createDOMRenderState,
  defaultCanvasBeginFill,
  defaultCanvasDrawCircle,
  defaultCanvasEndFill,
  defaultDOMShapeRenderer,
  prepareDOMDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderDOM,
  renderDOMBackground,
  ShapeKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '550px';
container.style.height = '400px';
document.body.appendChild(container);

export const state = createDOMRenderState(container, { backgroundColor: 0xeeddccff });
registerRenderer(state, ShapeKind, defaultDOMShapeRenderer);
registerCanvasShapeCommands([defaultCanvasBeginFill, defaultCanvasEndFill, defaultCanvasDrawCircle]);
export const scale = 1;

export function render(root: DisplayObject): void {
  if (!prepareDOMDisplayObjectRender(state, root)) return;
  renderDOMBackground(state);
  renderDOM(state);
}
