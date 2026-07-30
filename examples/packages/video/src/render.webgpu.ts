import type { Node2D } from '@flighthq/sdk';
import {
  SpriteKind,
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuSpriteRenderer,
  prepareScene2DRender,
  registerStandardWgpuMaterial,
  registerRenderer,
  registerWgpuImageTextureResolver,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x1a1a2eff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerStandardWgpuMaterial(state);
registerWgpuImageTextureResolver(state);
registerRenderer(state, SpriteKind, defaultWgpuSpriteRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuScene2D(state, root);
  submitWgpuRenderPass(state);
}
