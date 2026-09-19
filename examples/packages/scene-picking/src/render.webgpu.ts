import {
  webHostWgpuContext,
  appendWebSurface,
  getWebSurfaceElement,
  webHostSurfaceDisplay,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import type { Camera3D, Scene3DLightsLike, Node3D, WgpuEffectState } from '@flighthq/sdk';
import {
  beginWgpuEffectState,
  beginWgpuRenderPass,
  createWgpuEffectState,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  enableFlightDiagnostics,
  endWgpuEffectState,
  endWgpuRenderPass,
  prepareScene3DRender,
  defaultScene3DWgpuRenderRegistries,
  createWgpuSurface,
  setSurfaceDisplaySize,
  createAppWindow,
  openWindow,
} from '@flighthq/sdk';
import { renderWgpuScene3D } from '@flighthq/sdk/rendering';

const pixelRatio = window.devicePixelRatio || 1;
export const width = 800;
export const height = 600;
const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const wgpuSurface = await createWgpuSurface(webHostWgpuContext, appWindow, width * pixelRatio, height * pixelRatio);
if (wgpuSurface === null) throw new Error('WebGPU is unavailable in this environment');
setSurfaceDisplaySize(webHostSurfaceDisplay, wgpuSurface, width, height);
appendWebSurface(wgpuSurface, document.body);
export const canvas = getWebSurfaceElement(wgpuSurface)!;
const acquisition = wgpuSurface.acquisition;
export const screen = createWgpuScreenRenderTarget(webHostWgpuContext, acquisition.device, wgpuSurface, {
  format: acquisition.format,
});
export const state = createWgpuRenderState(acquisition.device, defaultScene3DWgpuRenderRegistries, {
  format: acquisition.format,
  pixelRatio,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x07 / 0xff, 0x10 / 0xff, 0x1d / 0xff, 1], depth: 1.0 } as const;
enableFlightDiagnostics(state);
const pipeline: WgpuEffectState = createWgpuEffectState(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});
export const scale = pixelRatio;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLightsLike>): void {
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  const scenePass = beginWgpuEffectState(pass, pipeline, screenClear, 'linear');
  prepareScene3DRender(state, scene, camera, lights);
  renderWgpuScene3D(scenePass, scene, camera, lights);
  endWgpuEffectState(scenePass, pipeline, []);
  endWgpuRenderPass(pass);
}
