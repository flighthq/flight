import type { Camera3D, GlRenderEffectPipeline, GlRenderState, Scene3DLightsLike, Node3D } from '@flighthq/sdk';
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
  renderGlBackground,
} from '@flighthq/sdk';
import {
  drawGlScene3D,
  registerGlAnisotropyPbrExtension,
  registerGlBlinnPhongMaterial,
  registerGlClearcoatPbrExtension,
  registerGlDepthMaterial,
  registerGlEmissiveMaterial,
  registerGlExtendedPbrMaterial,
  registerGlIridescencePbrExtension,
  registerGlLambertMaterial,
  registerGlMatcapMaterial,
  registerGlNormalMaterial,
  registerGlPhongMaterial,
  registerGlSheenPbrExtension,
  registerGlSpecularGlossinessPbrMaterial,
  registerGlSpecularPbrExtension,
  registerGlStandardPbrMaterial,
  registerGlWrappedDiffusePbrExtension,
  registerGlToonMaterial,
  registerGlTransmissionVolumePbrExtension,
  registerGlUnlitMaterial,
  registerGlVertexColorMaterial,
  registerGlWireframeMaterial,
} from '@flighthq/sdk/rendering';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const state = createGlRenderState(
  createGlContextFromCanvasElement(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  {
    pixelRatio,
    backgroundColor: 0x070a11ff,
  },
);
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
  registerGlAnisotropyPbrExtension(target);
  registerGlBlinnPhongMaterial(target);
  registerGlClearcoatPbrExtension(target);
  registerGlDepthMaterial(target);
  registerGlEmissiveMaterial(target);
  registerGlExtendedPbrMaterial(target);
  registerGlIridescencePbrExtension(target);
  registerGlLambertMaterial(target);
  registerGlMatcapMaterial(target);
  registerGlNormalMaterial(target);
  registerGlPhongMaterial(target);
  registerGlSheenPbrExtension(target);
  registerGlSpecularGlossinessPbrMaterial(target);
  registerGlSpecularPbrExtension(target);
  registerGlStandardPbrMaterial(target);
  registerGlWrappedDiffusePbrExtension(target);
  registerGlToonMaterial(target);
  registerGlTransmissionVolumePbrExtension(target);
  registerGlUnlitMaterial(target);
  registerGlVertexColorMaterial(target);
  registerGlWireframeMaterial(target);
}
