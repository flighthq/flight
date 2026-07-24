import { bakeGlEnvironmentIbl, drawGlEnvironmentSkybox, drawGlScene } from '@flighthq/scene-gl';
import type { Camera3D, Environment, GlRenderEffectPipeline, SceneLightsLike, SceneNode } from '@flighthq/sdk';
import {
  beginGlRenderEffectPipeline,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  endGlRenderEffectPipeline,
  prepareSceneRender,
  registerStandardPbrGlMaterial,
  renderGlBackground,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const width = 800;
export const height = 600;
export const canvas = createGlCanvasElement(width, height, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x050713ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerStandardPbrGlMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
let environmentBaked = false;

export function render(
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera3D>,
  lights: Readonly<SceneLightsLike>,
  environment: Readonly<Environment>,
): void {
  if (!environmentBaked) {
    bakeGlEnvironmentIbl(state, environment);
    environmentBaked = true;
  }

  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  drawGlEnvironmentSkybox(state, environment, camera, width / height);
  prepareSceneRender(state, scene, camera, lights);
  drawGlScene(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}
