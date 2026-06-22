import type { QuadBatch } from '@flighthq/sdk';
import {
  createGlCanvasElement,
  createGlRenderState,
  defaultGlQuadBatchRenderer,
  prepareDisplayObjectRender,
  QuadBatchKind,
  registerDefaultGlMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlSprite,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xeeddccff,
});
registerRenderer(state, QuadBatchKind, defaultGlQuadBatchRenderer);
registerDefaultGlMaterial(state);
export const scale = pixelRatio;

export function render(root: QuadBatch): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderGlBackground(state);
  renderGlSprite(state, root);
}
