import {
  webHostGl,
  appendWebSurface,
  getWebSurfaceElement,
  webHostSurfaceDisplay,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web/contract';
import type { Camera3D, GlEffectState, Scene3DLightsLike, Node3D } from '@flighthq/sdk';
import {
  createGlSurface,
  defaultScene3DGlRenderRegistries,
  beginGlEffectPass,
  createGlEffectState,
  createGlRenderState,
  enableFlightDiagnostics,
  endGlEffectPass,
  prepareScene3DRender,
  setSurfaceDisplaySize,
  createAppWindow,
  openWindow,
} from '@flighthq/sdk';
import { renderGlScene3D, renderGlScene3DShadowMap } from '@flighthq/sdk/scene3d-gl';

const pixelRatio = window.devicePixelRatio || 1;
const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, 800 * pixelRatio, 600 * pixelRatio, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
setSurfaceDisplaySize(webHostSurfaceDisplay, glSurface, 800, 600);
appendWebSurface(glSurface, document.body);
export const canvas = getWebSurfaceElement(glSurface)!;

export const state = createGlRenderState(glSurface.context, defaultScene3DGlRenderRegistries, {
  pixelRatio,
});
enableFlightDiagnostics(state);
const pipeline: GlEffectState = createGlEffectState(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;

const screenClear = { color: [0x0a / 0xff, 0x0c / 0xff, 0x10 / 0xff, 1], depth: 1.0 } as const;

export function render(
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLightsLike>,
  shadowCamera: Readonly<Camera3D>,
): void {
  prepareScene3DRender(state, scene, camera, lights);
  renderGlScene3DShadowMap(state, scene, shadowCamera, lights.directional);

  const pass = beginGlEffectPass(state, pipeline, screenClear, 'linear');
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  renderGlScene3D(pass, scene, camera, lights);
  endGlEffectPass(pass, pipeline, []);
}
