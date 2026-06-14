import type { QuadBatch } from '@flighthq/sdk';
import {
  createWebGPUCanvasElement,
  createWebGPURenderState,
  defaultWebGPUQuadBatchRenderer,
  prepareSpriteRender,
  QuadBatchKind,
  registerRenderer,
  renderWebGPUBackground,
  renderWebGPUSprite,
  submitWebGPURenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWebGPUCanvasElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xeeddccff,
});
registerRenderer(state, QuadBatchKind, defaultWebGPUQuadBatchRenderer);
export const scale = pixelRatio;

export function render(root: QuadBatch): void {
  if (!prepareSpriteRender(state, root)) return;
  renderWebGPUBackground(state);
  renderWebGPUSprite(state, root);
  submitWebGPURenderPass(state);
}
