import type { Node2D } from '@flighthq/sdk';
import {
  createWgpuCanvasElement,
  createWgpuRenderState,
  enableFlightDiagnostics,
  defaultWgpuShapeCommands,
  defaultWgpuShapeRenderer,
  defaultWgpuTextLabelRenderer,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerWgpuShapeCommands,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  ShapeKind,
  TextLabelKind,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(600, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x222222ff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
enableFlightDiagnostics(state);

registerWgpuStandardMaterial(state);
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerRenderer(state, TextLabelKind, defaultWgpuTextLabelRenderer);
registerWgpuShapeCommands(defaultWgpuShapeCommands);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuScene2D(state, root);
  submitWgpuRenderPass(state);
}
