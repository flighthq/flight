import type { Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  TextLabelKind,
  createWgpuCanvasElement,
  createWgpuRenderState,
  enableFlightDiagnostics,
  defaultWgpuShapeCommands,
  defaultWgpuShapeRenderer,
  defaultWgpuTextLabelRenderer,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  registerWgpuShapeCommands,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.style.margin = '0';
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  backgroundColor: 0x101827ff,
  pixelRatio,
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
