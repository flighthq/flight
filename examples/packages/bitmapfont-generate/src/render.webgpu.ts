import type { Node2D } from '@flighthq/sdk';
import {
  BitmapTextKind,
  SpriteKind,
  createWgpuCanvasElement,
  createWgpuRenderStateFromCanvasElement,
  scene2dWgpuPipeline,
  enableFlightDiagnostics,
  defaultWgpuBitmapTextRenderer,
  defaultWgpuSpriteRenderer,
  prepareScene2DRender,
  registerStandardWgpuTextureResolvers,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, scene2dWgpuPipeline, {
  pixelRatio,
  backgroundColor: 0x111827ff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
enableFlightDiagnostics(state);

registerStandardWgpuTextureResolvers(state);
registerWgpuStandardMaterial(state);
registerRenderer(state, SpriteKind, defaultWgpuSpriteRenderer);
registerRenderer(state, BitmapTextKind, defaultWgpuBitmapTextRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuScene2D(state, root);
  submitWgpuRenderPass(state);
}
