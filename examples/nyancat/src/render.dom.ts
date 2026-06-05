import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createDOMRenderState,
  defaultDOMBitmapRenderer,
  prepareDisplayObjectRender,
  registerRenderer,
  renderDOMBackground,
  renderDOMDisplayObject,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '220px';
container.style.height = '220px';
document.getElementById('app')!.appendChild(container);

export const state = createDOMRenderState(container, { backgroundColor: 0x000000ff, imageSmoothingEnabled: false });
registerRenderer(state, BitmapKind, defaultDOMBitmapRenderer);
export const scale = 1;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDOMBackground(state);
  renderDOMDisplayObject(state, root);
}
