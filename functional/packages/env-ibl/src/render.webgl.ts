// Gl-backend IBL render: bake the environment's split-sum set once, draw the skybox backdrop, then
// draw the scene whose PBR materials are lit purely by the baked environment (no punctual lights).
// drawGlScene / the env functions collide with the wgpu backend in the @flighthq/sdk barrel, so they
// are imported from @flighthq/scene-gl directly.
import { bakeEnvironmentIbl, drawGlEnvironmentSkybox, drawGlScene } from '@flighthq/scene-gl';
import type { Camera, Environment, GlRenderEffectPipeline, SceneLights, SceneNode } from '@flighthq/sdk';
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
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerStandardPbrGlMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

let baked = false;

export function render(
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera>,
  lights: Readonly<SceneLights>,
  environment: Readonly<Environment>,
): void {
  // The bake is the substantial, once-per-environment cost — run it before the first frame and reuse.
  if (!baked) {
    bakeEnvironmentIbl(state, environment);
    baked = true;
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
