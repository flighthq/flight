import type { DisplayObject } from '@flighthq/sdk';
import {
  createDOMRenderState,
  defaultDOMTextRenderer,
  prepareDisplayObjectRender,
  registerRenderer,
  renderDOMBackground,
  renderDOMDisplayObject,
  TextKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '400px';
container.style.height = '200px';
document.body.appendChild(container);

export const state = createDOMRenderState(container, { backgroundColor: 0xffffffff });
registerRenderer(state, TextKind, defaultDOMTextRenderer);
export const scale = 1;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDOMBackground(state);
  renderDOMDisplayObject(state, root);
}
