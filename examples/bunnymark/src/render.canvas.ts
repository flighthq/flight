import type { QuadBatch } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasQuadBatchRenderer,
  prepareSpriteRender,
  QuadBatchKind,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasSprite,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createCanvasElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xeeddccff,
});
registerRenderer(state, QuadBatchKind, defaultCanvasQuadBatchRenderer);
export const scale = pixelRatio;

export function render(root: QuadBatch): void {
  if (!prepareSpriteRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasSprite(state, root);
}
