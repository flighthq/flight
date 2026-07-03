import type { QuadBatch } from '@flighthq/sdk';
import {
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuQuadBatchRenderer,
  prepareDisplayObjectRender,
  QuadBatchKind,
  registerDefaultWgpuMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuSprite,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xeeddccff,
});
registerRenderer(state, QuadBatchKind, defaultWgpuQuadBatchRenderer);
registerDefaultWgpuMaterial(state);
export const scale = pixelRatio;

export function render(root: QuadBatch): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuSprite(state, root);
  submitWgpuRenderPass(state);
}
