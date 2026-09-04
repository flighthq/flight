import { webRaster2DSurfaceProvider } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  QuadBatchKind,
  TextLabelKind,
  createWgpuCanvasElement,
  createWgpuRenderStateFromCanvasElement,
  scene2dWgpuPipeline,
  enableFlightDiagnostics,
  defaultWgpuQuadBatchRenderer,
  defaultWgpuTextLabelRenderer,
  prepareScene2DRender,
  registerStandardWgpuTextureResolvers,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, scene2dWgpuPipeline, {
  pixelRatio,
  backgroundColor: 0x2a2a3aff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
  raster2DSurfaceProvider: webRaster2DSurfaceProvider,
});
enableFlightDiagnostics(state);

registerStandardWgpuTextureResolvers(state);
registerWgpuStandardMaterial(state);
registerRenderer(state, QuadBatchKind, defaultWgpuQuadBatchRenderer);
registerRenderer(state, TextLabelKind, defaultWgpuTextLabelRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuScene2D(state, root);
  submitWgpuRenderPass(state);
}
