import {
  webHostGl,
  appendWebSurface,
  getWebSurfaceElement,
  setWebSurfaceDisplaySize,
} from '@flighthq/host-web/contract';
import type { Camera3D, GlRenderEffectPipeline, Scene3DLightsLike, Node3D } from '@flighthq/sdk';
import {
  createGlSurface,
  scene3DGlPipeline,
  beginGlRenderEffectPipeline,
  createGlRenderEffectPipeline,
  createGlRenderState,
  enableFlightDiagnostics,
  endGlRenderEffectPipeline,
  prepareScene3DRender,
} from '@flighthq/sdk';
import { drawGlScene3D, drawGlScene3DShadowMap } from '@flighthq/sdk/rendering';

const pixelRatio = window.devicePixelRatio || 1;
const glSurface = createGlSurface(webHostGl, 800 * pixelRatio, 600 * pixelRatio, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
setWebSurfaceDisplaySize(glSurface, 800, 600);
appendWebSurface(glSurface, document.body);
export const canvas = getWebSurfaceElement(glSurface)!;

export const state = createGlRenderState(glSurface.context, scene3DGlPipeline, {
  pixelRatio,
});
enableFlightDiagnostics(state);
const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;

// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x0a / 0xff, 0x0c / 0xff, 0x10 / 0xff, 1], depth: 1.0 } as const;

export function render(
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLightsLike>,
  shadowCamera: Readonly<Camera3D>,
): void {
  // The directional depth pass must finish before the HDR effect target opens its framebuffer.
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3DShadowMap(state, scene, shadowCamera, lights.directional);

  const pass = beginGlRenderEffectPipeline(state, pipeline, 'linear', screenClear);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  drawGlScene3D(pass, scene, camera, lights);
  endGlRenderEffectPipeline(pass, pipeline, []);
}
