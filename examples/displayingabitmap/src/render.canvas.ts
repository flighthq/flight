import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasBitmapRenderer,
  prepareCanvasDisplayObjectRender,
  registerRenderer,
  renderCanvas,
  renderCanvasBackground,
} from '@flighthq/sdk';

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
  if (!prepareCanvasDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvas(state);
}
