import type { Camera3D, GlRenderEffectPipeline, Scene3DLightsLike, Node3D } from '@flighthq/sdk';
import {
  beginGlRenderEffectPipeline,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  enableFlightDiagnostics,
  endGlRenderEffectPipeline,
  prepareScene3DRender,
  registerStandardGlTextureResolvers,
  registerStandardPbrGlMaterial,
  renderGlBackground,
} from '@flighthq/sdk';
import { drawGlScene3D, drawGlScene3DShadowMap } from '@flighthq/sdk/rendering';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
enableFlightDiagnostics(state);
registerStandardGlTextureResolvers(state);
registerStandardPbrGlMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
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
  // The directional depth pass must finish before the HDR effect target opens its framebuffer.
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3DShadowMap(state, scene, shadowCamera);

  beginGlRenderEffectPipeline(state, pipeline, 'linear');
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}
