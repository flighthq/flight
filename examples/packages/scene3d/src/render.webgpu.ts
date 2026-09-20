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
  beginWgpuFrame,
  beginWgpuEffectPass,
  beginWgpuRenderPass,
  createWgpuEffectState,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  enableFlightDiagnostics,
  endWgpuEffectPass,
  endWgpuRenderPass,
  prepareScene3DRender,
  wgpuScene3DRenderRegistries,
  submitWgpuFrame,
  createWgpuSurface,
  setSurfaceDisplaySize,
  createAppWindow,
  openWindow,
} from '@flighthq/sdk';
import { renderWgpuScene3D, renderWgpuScene3DShadowMap } from '@flighthq/sdk/scene3d-wgpu';

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
export const state = createWgpuRenderState(acquisition.device, wgpuScene3DRenderRegistries, {
  format: acquisition.format,
  pixelRatio,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x0a / 0xff, 0x0c / 0xff, 0x10 / 0xff, 1], depth: 1.0 } as const;
enableFlightDiagnostics(state);
const pipeline: WgpuEffectState = createWgpuEffectState(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;

export function render(
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLightsLike>,
  shadowCamera: Readonly<Camera3D>,
): void {
  prepareScene3DRender(state, scene, camera, lights);
  beginWgpuFrame(state);
  renderWgpuScene3DShadowMap(state, scene, shadowCamera, lights.directional);
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  const scenePass = beginWgpuEffectPass(pass, pipeline, screenClear, 'linear');
  renderWgpuScene3D(scenePass, scene, camera, lights);
  endWgpuEffectPass(scenePass, pipeline, []);
  endWgpuRenderPass(pass);
  submitWgpuFrame(state);
}
