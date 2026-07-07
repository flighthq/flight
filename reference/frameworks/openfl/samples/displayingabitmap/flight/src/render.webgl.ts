import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createGlCanvasElement,
  createGlRenderState,
  defaultGlBitmapRenderer,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xeeddccff,
});
registerRenderer(state, BitmapKind, defaultGlBitmapRenderer);
registerDefaultGlMaterial(state);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
}
