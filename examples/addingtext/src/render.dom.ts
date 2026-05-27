import type { DisplayObject } from '@flighthq/engine';
import {
  createDOMRenderState,
  defaultDOMTextRenderer,
  registerRenderer,
  renderDOMBackground,
  renderDOMDisplayObject,
  TextKind,
} from '@flighthq/engine';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '400px';
container.style.height = '200px';
document.body.appendChild(container);

export const state = createDOMRenderState(container, { backgroundColor: 0xffffffff });
registerRenderer(state, TextKind, defaultDOMTextRenderer);
export const scale = 1;

export function render(root: DisplayObject): void {
  renderDOMBackground(state);
  renderDOMDisplayObject(state, root);
}
