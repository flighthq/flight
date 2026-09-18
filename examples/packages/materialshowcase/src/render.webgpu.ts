import {
  webHostWgpuContext,
  appendWebSurface,
  getWebSurfaceElement,
  webHostSurfaceDisplay,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import type { Camera3D, Scene3DLightsLike, Node3D, WgpuRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginWgpuRenderEffectPipeline,
  beginWgpuRenderPass,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  enableFlightDiagnostics,
  endWgpuRenderEffectPipeline,
  endWgpuRenderPass,
  prepareScene3DRender,
  scene3DWgpuPipeline,
  createWgpuSurface,
  setSurfaceDisplaySize,
  createAppWindow,
  openWindow,
} from '@flighthq/sdk';
import { drawWgpuScene3D } from '@flighthq/sdk/rendering';

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
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x07 / 0xff, 0x0a / 0xff, 0x11 / 0xff, 1], depth: 1.0 } as const;
enableFlightDiagnostics(state);
const pipeline: WgpuRenderEffectPipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const supportsExtendedPbr = false;
export const supportsVertexColor0 = false;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLightsLike>): void {
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  const scenePass = beginWgpuRenderEffectPipeline(pass, pipeline, screenClear, 'linear');
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(scenePass, scene, camera, lights);
  endWgpuRenderEffectPipeline(scenePass, pipeline, []);
  endWgpuRenderPass(pass);
}
