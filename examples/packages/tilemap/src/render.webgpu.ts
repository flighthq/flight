import type { Node2D } from '@flighthq/sdk';
import {
  SpriteKind,
  TilemapKind,
  createWgpuCanvasElement,
  createWgpuRenderStateFromCanvasElement,
  enableFlightDiagnostics,
  defaultWgpuSpriteRenderer,
  defaultWgpuTilemapRenderer,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerStandardWgpuTextureResolvers,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, {
  pixelRatio,
  backgroundColor: 0x1a1a2eff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
enableFlightDiagnostics(state);

registerWgpuStandardMaterial(state);
registerStandardWgpuTextureResolvers(state);
registerRenderer(state, SpriteKind, defaultWgpuSpriteRenderer);
registerRenderer(state, TilemapKind, defaultWgpuTilemapRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuScene2D(state, root);
  submitWgpuRenderPass(state);
}
