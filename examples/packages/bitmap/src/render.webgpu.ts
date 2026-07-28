import type { Node2D } from '@flighthq/sdk';
import {
  SpriteKind,
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuSpriteRenderer,
  prepareScene2DRender,
  registerStandardWgpuMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0xf0f0f0ff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerStandardWgpuMaterial(state);
registerRenderer(state, SpriteKind, defaultWgpuSpriteRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuScene2D(state, root);
  submitWgpuRenderPass(state);
}
