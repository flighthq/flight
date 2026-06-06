import type { DisplayObject } from '@flighthq/sdk';
import {
  createDOMRenderState,
  defaultDOMShapeRenderer,
  prepareDisplayObjectRender,
  registerRenderer,
  renderDOMBackground,
  renderDOMDisplayObject,
  ShapeKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '600px';
document.body.appendChild(container);

export const state = createDOMRenderState(container, { backgroundColor: 0xff000000 });
registerRenderer(state, ShapeKind, defaultDOMShapeRenderer);
export const scale = 1;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDOMBackground(state);
  renderDOMDisplayObject(state, root);
}
