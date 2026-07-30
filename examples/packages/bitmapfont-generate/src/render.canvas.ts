import type { Node2D } from '@flighthq/sdk';
import {
  SpriteKind,
  BitmapTextKind,
  createCanvasElement,
  createCanvasRenderState,
  enableFlightDiagnostics,
  defaultCanvasSpriteRenderer,
  defaultCanvasBitmapTextRenderer,
  prepareScene2DRender,
  registerCanvasImageTextureResolver,
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
enableFlightDiagnostics(state);

registerCanvasImageTextureResolver(state);
registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);
registerRenderer(state, BitmapTextKind, defaultCanvasBitmapTextRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasScene2D(state, root);
}
