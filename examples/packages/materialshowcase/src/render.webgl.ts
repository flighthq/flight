import type { Camera3D, GlRenderEffectPipeline, GlRenderState, Scene3DLightsLike, Node3D } from '@flighthq/sdk';
import {
  beginGlRenderEffectPipeline,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  enableFlightDiagnostics,
  endGlRenderEffectPipeline,
  prepareScene3DRender,
  registerStandardGlTextureResolvers,
  renderGlBackground,
} from '@flighthq/sdk';
import {
  drawGlScene3D,
  registerAnisotropyPbrGlExtension,
  registerBlinnPhongGlMaterial,
  registerClearcoatPbrGlExtension,
  registerDepthGlMaterial,
  registerEmissiveGlMaterial,
  registerExtendedPbrGlMaterial,
  registerIridescencePbrGlExtension,
  registerLambertGlMaterial,
  registerMatcapGlMaterial,
  registerNormalGlMaterial,
  registerPhongGlMaterial,
  registerSheenPbrGlExtension,
  registerSpecularGlossinessPbrGlMaterial,
  registerSpecularPbrGlExtension,
  registerStandardPbrGlMaterial,
  registerWrappedDiffusePbrGlExtension,
  registerToonGlMaterial,
  registerTransmissionVolumePbrGlExtension,
  registerUnlitGlMaterial,
  registerVertexColorGlMaterial,
  registerWireframeGlMaterial,
} from '@flighthq/sdk/rendering';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x070a11ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
enableFlightDiagnostics(state);
registerStandardGlTextureResolvers(state);
registerAllGlMaterials(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const supportsExtendedPbr = true;
export const supportsVertexColor0 = true;

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

function registerAllGlMaterials(target: GlRenderState): void {
  registerAnisotropyPbrGlExtension(target);
  registerBlinnPhongGlMaterial(target);
  registerClearcoatPbrGlExtension(target);
  registerDepthGlMaterial(target);
  registerEmissiveGlMaterial(target);
  registerExtendedPbrGlMaterial(target);
  registerIridescencePbrGlExtension(target);
  registerLambertGlMaterial(target);
  registerMatcapGlMaterial(target);
  registerNormalGlMaterial(target);
  registerPhongGlMaterial(target);
  registerSheenPbrGlExtension(target);
  registerSpecularGlossinessPbrGlMaterial(target);
  registerSpecularPbrGlExtension(target);
  registerStandardPbrGlMaterial(target);
  registerWrappedDiffusePbrGlExtension(target);
  registerToonGlMaterial(target);
  registerTransmissionVolumePbrGlExtension(target);
  registerUnlitGlMaterial(target);
  registerVertexColorGlMaterial(target);
  registerWireframeGlMaterial(target);
}
