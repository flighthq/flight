import type { Camera3D, Scene3DLightsLike, Node3D, WgpuRenderEffectPipeline, WgpuRenderState } from '@flighthq/sdk';
import {
  beginWgpuRenderEffectPipeline,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  enableFlightDiagnostics,
  endWgpuRenderEffectPipeline,
  prepareScene3DRender,
  registerStandardWgpuTextureResolvers,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import {
  drawWgpuScene3D,
  registerWgpuBlinnPhongMaterial,
  registerWgpuDepthMaterial,
  registerWgpuEmissiveMaterial,
  registerWgpuLambertMaterial,
  registerWgpuMatcapMaterial,
  registerWgpuNormalMaterial,
  registerWgpuPhongMaterial,
  registerWgpuSpecularGlossinessPbrMaterial,
  registerWgpuStandardPbrMaterial,
  registerWgpuToonMaterial,
  registerWgpuUnlitMaterial,
  registerWgpuVertexColorMaterial,
  registerWgpuWireframeMaterial,
} from '@flighthq/sdk/rendering';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, {
  pixelRatio,
  backgroundColor: 0x070a11ff,
});
enableFlightDiagnostics(state);
registerAllWgpuMaterials(state);
registerStandardWgpuTextureResolvers(state);

const pipeline: WgpuRenderEffectPipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const supportsExtendedPbr = false;
export const supportsVertexColor0 = false;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLightsLike>): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

function registerAllWgpuMaterials(target: WgpuRenderState): void {
  registerWgpuBlinnPhongMaterial(target);
  registerWgpuDepthMaterial(target);
  registerWgpuEmissiveMaterial(target);
  registerWgpuLambertMaterial(target);
  registerWgpuMatcapMaterial(target);
  registerWgpuNormalMaterial(target);
  registerWgpuPhongMaterial(target);
  registerWgpuSpecularGlossinessPbrMaterial(target);
  registerWgpuStandardPbrMaterial(target);
  registerWgpuToonMaterial(target);
  registerWgpuUnlitMaterial(target);
  registerWgpuVertexColorMaterial(target);
  registerWgpuWireframeMaterial(target);
}
