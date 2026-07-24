import {
  drawGlScene,
  registerAnisotropyPbrGlMaterial,
  registerBlinnPhongGlMaterial,
  registerClearcoatPbrGlMaterial,
  registerDepthGlMaterial,
  registerEmissiveGlMaterial,
  registerIridescencePbrGlMaterial,
  registerLambertGlMaterial,
  registerMatcapGlMaterial,
  registerNormalGlMaterial,
  registerPhongGlMaterial,
  registerSheenPbrGlMaterial,
  registerSpecularGlossinessPbrGlMaterial,
  registerSpecularPbrGlMaterial,
  registerStandardPbrGlMaterial,
  registerSubsurfacePbrGlMaterial,
  registerToonGlMaterial,
  registerTransmissionVolumePbrGlMaterial,
  registerUnlitGlMaterial,
  registerVertexColorGlMaterial,
  registerWireframeGlMaterial,
} from '@flighthq/scene-gl';
import type { Camera3D, GlRenderEffectPipeline, GlRenderState, SceneLightsLike, SceneNode } from '@flighthq/sdk';
import {
  beginGlRenderEffectPipeline,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  endGlRenderEffectPipeline,
  prepareSceneRender,
  renderGlBackground,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x070a11ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerAllGlMaterials(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;

export function render(
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera3D>,
  lights: Readonly<SceneLightsLike>,
): void {
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

function registerAllGlMaterials(target: GlRenderState): void {
  registerAnisotropyPbrGlMaterial(target);
  registerBlinnPhongGlMaterial(target);
  registerClearcoatPbrGlMaterial(target);
  registerDepthGlMaterial(target);
  registerEmissiveGlMaterial(target);
  registerIridescencePbrGlMaterial(target);
  registerLambertGlMaterial(target);
  registerMatcapGlMaterial(target);
  registerNormalGlMaterial(target);
  registerPhongGlMaterial(target);
  registerSheenPbrGlMaterial(target);
  registerSpecularGlossinessPbrGlMaterial(target);
  registerSpecularPbrGlMaterial(target);
  registerStandardPbrGlMaterial(target);
  registerSubsurfacePbrGlMaterial(target);
  registerToonGlMaterial(target);
  registerTransmissionVolumePbrGlMaterial(target);
  registerUnlitGlMaterial(target);
  registerVertexColorGlMaterial(target);
  registerWireframeGlMaterial(target);
}
