import { webRaster2DSurfaceProvider } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  beginWgpuRenderPass,
  createWgpuAcquisitionFromCanvasElement,
  createWgpuCanvasElement,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  defaultWgpuParticleEmitter2DRenderer,
  defaultWgpuTextLabelRenderer,
  enableFlightDiagnostics,
  enableWgpuBlendModeSupport,
  endWgpuRenderPass,
  ParticleEmitter2DKind,
  prepareScene2DRender,
  registerRenderer,
  renderWgpuScene2D,
  scene3DWgpuPipeline,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

const acquisition = await createWgpuAcquisitionFromCanvasElement(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
  sceneGraphSyncPolicy: 'requiresInvalidation',
  raster2DSurfaceProvider: webRaster2DSurfaceProvider,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x0a / 0xff, 0x0a / 0xff, 0x14 / 0xff, 1], depth: 1.0 } as const;
enableFlightDiagnostics(state);
registerRenderer(state, ParticleEmitter2DKind, defaultWgpuParticleEmitter2DRenderer);
registerRenderer(state, TextLabelKind, defaultWgpuTextLabelRenderer);
enableWgpuBlendModeSupport(state);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  renderWgpuScene2D(pass, root);
  endWgpuRenderPass(pass);
}
