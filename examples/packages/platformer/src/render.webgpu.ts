import type { Node2D } from '@flighthq/sdk';
import {
  createWgpuCanvasElement,
  createWgpuRenderState,
  enableFlightDiagnostics,
  defaultWgpuShapeCommands,
  defaultWgpuShapeRenderer,
  defaultWgpuSpriteRenderer,
  defaultWgpuTextLabelRenderer,
  prepareScene2DRender,
  registerWgpuImageTextureResolver,
  registerStandardWgpuMaterial,
  registerWgpuShapeCommands,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x87ceebff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
enableFlightDiagnostics(state);

registerStandardWgpuMaterial(state);
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerRenderer(state, SpriteKind, defaultWgpuSpriteRenderer);
registerRenderer(state, TextLabelKind, defaultWgpuTextLabelRenderer);
registerWgpuImageTextureResolver(state);
registerWgpuShapeCommands(defaultWgpuShapeCommands);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuScene2D(state, root);
  submitWgpuRenderPass(state);
}
