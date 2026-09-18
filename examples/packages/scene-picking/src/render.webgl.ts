import {
  webHostGl,
  appendWebSurface,
  getWebSurfaceElement,
  webHostSurfaceDisplay,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web/contract';
import type { Camera3D, GlRenderEffectPipeline, Scene3DLightsLike, Node3D } from '@flighthq/sdk';
import {
  createGlSurface,
  scene3DGlPipeline,
  beginGlRenderEffectPipeline,
  createGlRenderEffectPipeline,
  createGlRenderState,
  enableFlightDiagnostics,
  endGlRenderEffectPipeline,
  prepareScene3DRender,
  setSurfaceDisplaySize,
  createAppWindow,
  openWindow,
} from '@flighthq/sdk';
import { drawGlScene3D } from '@flighthq/sdk/rendering';

const pixelRatio = window.devicePixelRatio || 1;
export const width = 800;
export const height = 600;
const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, width * pixelRatio, height * pixelRatio, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
setSurfaceDisplaySize(webHostSurfaceDisplay, glSurface, width, height);
appendWebSurface(glSurface, document.body);
export const canvas = getWebSurfaceElement(glSurface)!;
export const state = createGlRenderState(glSurface.context, scene3DGlPipeline, {
  pixelRatio,
});
enableFlightDiagnostics(state);
const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});
export const scale = pixelRatio;

// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x07 / 0xff, 0x10 / 0xff, 0x1d / 0xff, 1], depth: 1.0 } as const;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLightsLike>): void {
  const pass = beginGlRenderEffectPipeline(state, pipeline, 'linear', screenClear);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(pass, scene, camera, lights);
  endGlRenderEffectPipeline(pass, pipeline, []);
}
