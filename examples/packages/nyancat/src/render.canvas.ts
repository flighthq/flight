import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasBitmapRenderer,
  prepareDisplayObjectRender,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(220, 220, pixelRatio);
document.getElementById('app')!.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0x000000ff,
  imageSmoothingEnabled: false,
});
registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}
