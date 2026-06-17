import type { QuadBatch } from '@flighthq/sdk';
import {
  createWebGLCanvasElement,
  createWebGLRenderState,
  defaultWebGLQuadBatchRenderer,
  prepareSpriteRender,
  QuadBatchKind,
  registerDefaultWebGLMaterial,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLSprite,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWebGLCanvasElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xeeddccff,
});
registerRenderer(state, QuadBatchKind, defaultWebGLQuadBatchRenderer);
registerDefaultWebGLMaterial(state);
export const scale = pixelRatio;

export function render(root: QuadBatch): void {
  if (!prepareSpriteRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLSprite(state, root);
}
