import type { QuadBatch } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasQuadBatchRenderer,
  QuadBatchKind,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasSprite,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createCanvasElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, QuadBatchKind, defaultCanvasQuadBatchRenderer);
export const scale = pixelRatio;

export function render(root: QuadBatch): void {
  renderCanvasBackground(state);
  renderCanvasSprite(state, root);
}
