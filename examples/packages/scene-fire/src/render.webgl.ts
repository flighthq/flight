import {
  webHostGl,
  appendWebSurface,
  getWebSurfaceElement,
  webHostSurfaceDisplay,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web/contract';
import type { Camera3D, GlEffectState, Node3D, Effect, Scene3DLightsLike } from '@flighthq/sdk';
import {
  createGlSurface,
  glScene3DRenderPreset,
  beginGlEffectPass,
  createGlEffectState,
  createGlRenderState,
  enableFlightDiagnostics,
  endGlEffectPass,
  prepareScene3DRender,
  registerGlBloomEffect,
  registerGlToneMapEffect,
  registerGlVignetteEffect,
  setSurfaceDisplaySize,
  createAppWindow,
  openWindow,
} from '@flighthq/sdk';
import { registerGlParticleEmitter3DPass, renderGlScene3D } from '@flighthq/sdk/scene3d-gl';

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
export const state = createGlRenderState(glSurface.context, { ...glScene3DRenderPreset, pixelRatio });
// The particle pass is opt-in: without this registration renderGlScene3D draws no emitters.
registerGlParticleEmitter3DPass(state);
enableFlightDiagnostics(state);
registerGlBloomEffect(state);
registerGlToneMapEffect(state);
registerGlVignetteEffect(state);

const pipeline: GlEffectState = createGlEffectState(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;

// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x09 / 0xff, 0x07 / 0xff, 0x0a / 0xff, 1], depth: 1.0 } as const;

export function render(
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLightsLike>,
  effects: readonly Effect[],
): void {
  const pass = beginGlEffectPass(state, pipeline, screenClear, 'linear');
  prepareScene3DRender(state, scene, camera, lights);
  renderGlScene3D(pass, scene, camera, lights);
  endGlEffectPass(pass, pipeline, effects);
}
