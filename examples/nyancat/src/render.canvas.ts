import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasBitmapRenderer,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(220, 220, pixelRatio);
document.getElementById('app')!.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  backgroundColor: 0x000000ff,
  contextAttributes: { alpha: false },
  imageSmoothingEnabled: false,
});
registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}
