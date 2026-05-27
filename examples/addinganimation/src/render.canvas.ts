import type { DisplayObject } from '@flighthq/engine';
import {
  BitmapKind,
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasBitmapRenderer,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
} from '@flighthq/engine';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}
