import type { QuadBatch } from '@flighthq/engine';
import {
  createWebGLElement,
  createWebGLRenderState,
  defaultWebGLQuadBatchRenderer,
  QuadBatchKind,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLSprite,
} from '@flighthq/engine';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWebGLElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, QuadBatchKind, defaultWebGLQuadBatchRenderer);
export const scale = pixelRatio;

export function render(root: QuadBatch): void {
  renderWebGLBackground(state);
  renderWebGLSprite(state, root);
}
