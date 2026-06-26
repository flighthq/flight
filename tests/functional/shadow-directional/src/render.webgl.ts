// drawGlScene exists on both scene-gl and scene-wgpu, so it collides in the @flighthq/sdk barrel —
// import the Gl scene functions directly. drawGlSceneShadowMap renders scene depth from the light into
// the shadow map (setting the per-state shadow on the runtime); drawGlScene's lit binds then PCF-sample
// it during shading.
import { drawGlScene, drawGlSceneShadowMap } from '@flighthq/scene-gl';
import type { Camera, GlRenderEffectPipeline, SceneLights, SceneNode } from '@flighthq/sdk';
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

export function render(
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera>,
  lights: Readonly<SceneLights>,
  shadowCamera: Readonly<Camera>,
): void {
  // 1) Depth pass: render the scene from the light's POV into the shadow map (off the scene target).
  drawGlSceneShadowMap(state, scene, shadowCamera);

  // 2) Forward-lit pass into the effect pipeline's rgba16f + depth target; the lit shaders PCF-sample
  // the shadow map set above. Clear depth to the far plane so the LESS depth test occludes correctly.
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareSceneRender(state, scene, camera, lights);
  drawGlScene(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}
