import type { Camera3D, GlRenderEffectPipeline, Scene3DLightsLike, Node3D } from '@flighthq/sdk';
import {
  createGlContextFromCanvasElement,
  beginGlRenderEffectPipeline,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  enableFlightDiagnostics,
  endGlRenderEffectPipeline,
  prepareScene3DRender,
  registerStandardGlTextureResolvers,
  registerGlStandardPbrMaterial,
  renderGlBackground,
} from '@flighthq/sdk';
import { drawGlScene3D } from '@flighthq/sdk/rendering';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextFromCanvasElement(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  {
    pixelRatio,
    backgroundColor: 0x1a1c24ff,
  },
);
enableFlightDiagnostics(state);
registerStandardGlTextureResolvers(state);
registerGlStandardPbrMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLightsLike>): void {
  beginGlRenderEffectPipeline(state, pipeline, 'linear');
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}
