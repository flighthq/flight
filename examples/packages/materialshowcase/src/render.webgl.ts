import {
  drawGlScene3D,
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
} from '@flighthq/scene3d-gl';
import type { Camera3D, GlRenderEffectPipeline, GlRenderState, Scene3DLightsLike, Node3D } from '@flighthq/sdk';
import {
  beginGlRenderEffectPipeline,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  endGlRenderEffectPipeline,
  prepareScene3DRender,
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
export const supportsVertexColor0 = true;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLightsLike>): void {
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
