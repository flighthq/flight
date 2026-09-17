import { webSurfaceCreateCapability } from '@flighthq/host-web';
import { webRaster2DSurfaceCreator } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  beginWgpuRenderPass,
  createWebWgpuHostBackend,
  createWgpuAcquisition,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  defaultWgpuQuadBatchRenderer,
  defaultWgpuTextLabelRenderer,
  enableFlightDiagnostics,
  endWgpuRenderPass,
  prepareScene2DRender,
  QuadBatchKind,
  registerRenderer,
  renderWgpuScene2D,
  scene3DWgpuPipeline,
  TextLabelKind,
  createSurface,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createSurface(webSurfaceCreateCapability, 800 * pixelRatio, 500 * pixelRatio);
canvas.style.width = '800px';
canvas.style.height = '500px';
document.body.appendChild(canvas);

const webWgpuHost = createWebWgpuHostBackend();
const acquisition = await createWgpuAcquisition(webWgpuHost, canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(webWgpuHost, acquisition.device, canvas, {
  format: acquisition.format,
});
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
  sceneGraphSyncPolicy: 'requiresInvalidation',
  raster2DSurfaceProvider: webRaster2DSurfaceCreator,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x2a / 0xff, 0x2a / 0xff, 0x3a / 0xff, 1], depth: 1.0 } as const;
enableFlightDiagnostics(state);
registerRenderer(state, QuadBatchKind, defaultWgpuQuadBatchRenderer);
registerRenderer(state, TextLabelKind, defaultWgpuTextLabelRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  renderWgpuScene2D(pass, root);
  endWgpuRenderPass(pass);
}
