import type { Camera3D, GlRenderEffectPipeline, Scene3DLightsLike, Node3D } from '@flighthq/sdk';
import {
  scene2dGlPipeline,
  createGlContextState,
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
import { drawGlScene3D, registerBuiltInGlModifierSnippets, registerGlShadedMaterial } from '@flighthq/sdk/rendering';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  ),
  scene2dGlPipeline,
  {
    pixelRatio,
    backgroundColor: 0x07101bff,
  },
);
enableFlightDiagnostics(state);
registerStandardGlTextureResolvers(state);
registerGlShadedMaterial(state);
registerBuiltInGlModifierSnippets(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLightsLike>): void {
  beginGlRenderEffectPipeline(state, pipeline, 'linear');
  renderGlBackground(state);
  state.gl.depthMask(true);
  state.gl.clearDepth(1);
  state.gl.clear(state.gl.DEPTH_BUFFER_BIT);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}
