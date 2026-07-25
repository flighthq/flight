import { drawGlScene3D } from '@flighthq/scene-gl';
import type { Camera3D, GlRenderEffectPipeline, Scene3DLightsLike, Node3D } from '@flighthq/sdk';
import {
  beginGlRenderEffectPipeline,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  endGlRenderEffectPipeline,
  prepareScene3DRender,
  registerStandardPbrGlMaterial,
  renderGlBackground,
} from '@flighthq/sdk';

// drawGlScene3D exists on both scene-gl and scene-wgpu, so it collides in the @flighthq/sdk barrel
// (re-exported from both) and is unavailable there — import the Gl one directly from its package.

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x1a1c24ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerStandardPbrGlMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export function render(
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLightsLike>,
): void {
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}
