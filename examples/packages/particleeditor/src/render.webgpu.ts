import {
  webHostWgpuContext,
  webHostCanvas,
  webHostImage,
  appendWebSurface,
  getWebSurfaceElement,
  webHostSurfaceDisplay,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  beginWgpuRenderPass,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  wgpuParticleEmitter2DRenderer,
  wgpuTextLabelRenderer,
  enableFlightDiagnostics,
  enableWgpuBlendModeSupport,
  endWgpuRenderPass,
  ParticleEmitter2DKind,
  prepareScene2DRender,
  registerNodeRenderer,
  renderWgpuScene2D,
  wgpuScene3DRenderPreset,
  TextLabelKind,
  createWgpuSurface,
  setSurfaceDisplaySize,
  createAppWindow,
  openWindow,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const wgpuSurface = await createWgpuSurface(webHostWgpuContext, appWindow, 800 * pixelRatio, 600 * pixelRatio);
if (wgpuSurface === null) throw new Error('WebGPU is unavailable in this environment');
setSurfaceDisplaySize(webHostSurfaceDisplay, wgpuSurface, 800, 600);
appendWebSurface(wgpuSurface, document.body);
export const canvas = getWebSurfaceElement(wgpuSurface)!;
const acquisition = wgpuSurface.acquisition;
export const screen = createWgpuScreenRenderTarget(webHostWgpuContext, acquisition.device, wgpuSurface, {
  format: acquisition.format,
});
export const state = createWgpuRenderState(acquisition.device, {
  ...wgpuScene3DRenderPreset,
  format: acquisition.format,
  pixelRatio,
  sceneGraphSyncPolicy: 'requiresInvalidation',
  canvasHost: webHostCanvas,
  imageHost: webHostImage,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x0a / 0xff, 0x0a / 0xff, 0x14 / 0xff, 1], depth: 1.0 } as const;
enableFlightDiagnostics(state);
registerNodeRenderer(state, ParticleEmitter2DKind, wgpuParticleEmitter2DRenderer);
registerNodeRenderer(state, TextLabelKind, wgpuTextLabelRenderer);
enableWgpuBlendModeSupport(state);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  renderWgpuScene2D(pass, root);
  endWgpuRenderPass(pass);
}
