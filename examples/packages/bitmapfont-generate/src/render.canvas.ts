import type { Node2D } from '@flighthq/sdk';
import {
  BitmapKind,
  BitmapTextKind,
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasBitmapRenderer,
  defaultCanvasBitmapTextRenderer,
  prepareScene2DRender,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasScene2D,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0x111827ff,
});

registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);
registerRenderer(state, BitmapTextKind, defaultCanvasBitmapTextRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasScene2D(state, root);
}
