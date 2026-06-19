import type { DisplayObject } from '@flighthq/sdk';
import {
  createDOMRenderState,
  defaultDOMNativeTextRenderer,
  NativeTextKind,
  prepareDisplayObjectRender,
  registerRenderer,
  renderDOMBackground,
  renderDOMDisplayObject,
} from '@flighthq/sdk';

// NativeText is platform/DOM-backed, so this test runs on the DOM backend only — there is no canvas or
// webgl render.*.ts, which restricts discovery to DOM.
const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '600px';
document.body.appendChild(container);

export const state = createDOMRenderState(container, { backgroundColor: 0xffffffff });
registerRenderer(state, NativeTextKind, defaultDOMNativeTextRenderer);
export const scale = 1;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDOMBackground(state);
  renderDOMDisplayObject(state, root);
}
