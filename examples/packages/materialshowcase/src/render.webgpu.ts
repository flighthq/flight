import {
  drawWgpuScene,
  registerAnisotropyPbrWgpuMaterial,
  registerBlinnPhongWgpuMaterial,
  registerClearcoatPbrWgpuMaterial,
  registerDepthWgpuMaterial,
  registerEmissiveWgpuMaterial,
  registerIridescencePbrWgpuMaterial,
  registerLambertWgpuMaterial,
  registerMatcapWgpuMaterial,
  registerNormalWgpuMaterial,
  registerPhongWgpuMaterial,
  registerSheenPbrWgpuMaterial,
  registerSpecularGlossinessPbrWgpuMaterial,
  registerSpecularPbrWgpuMaterial,
  registerStandardPbrWgpuMaterial,
  registerSubsurfacePbrWgpuMaterial,
  registerToonWgpuMaterial,
  registerTransmissionVolumePbrWgpuMaterial,
  registerUnlitWgpuMaterial,
  registerVertexColorWgpuMaterial,
  registerWireframeWgpuMaterial,
} from '@flighthq/scene-wgpu';
import type { Camera3D, SceneLightsLike, SceneNode, WgpuRenderEffectPipeline, WgpuRenderState } from '@flighthq/sdk';
import {
  beginWgpuRenderEffectPipeline,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  prepareSceneRender,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x070a11ff,
});
registerAllWgpuMaterials(state);

const pipeline: WgpuRenderEffectPipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const supportsVertexColor0 = false;

export function render(
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera3D>,
  lights: Readonly<SceneLightsLike>,
): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  prepareSceneRender(state, scene, camera, lights);
  drawWgpuScene(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

function registerAllWgpuMaterials(target: WgpuRenderState): void {
  registerAnisotropyPbrWgpuMaterial(target);
  registerBlinnPhongWgpuMaterial(target);
  registerClearcoatPbrWgpuMaterial(target);
  registerDepthWgpuMaterial(target);
  registerEmissiveWgpuMaterial(target);
  registerIridescencePbrWgpuMaterial(target);
  registerLambertWgpuMaterial(target);
  registerMatcapWgpuMaterial(target);
  registerNormalWgpuMaterial(target);
  registerPhongWgpuMaterial(target);
  registerSheenPbrWgpuMaterial(target);
  registerSpecularGlossinessPbrWgpuMaterial(target);
  registerSpecularPbrWgpuMaterial(target);
  registerStandardPbrWgpuMaterial(target);
  registerSubsurfacePbrWgpuMaterial(target);
  registerToonWgpuMaterial(target);
  registerTransmissionVolumePbrWgpuMaterial(target);
  registerUnlitWgpuMaterial(target);
  registerVertexColorWgpuMaterial(target);
  registerWireframeWgpuMaterial(target);
}
