import { createMatrix } from '@flighthq/geometry';
import {
  beginGlRenderTarget,
  drawGlLinearToSrgbPass,
  endGlRenderTarget,
  renderGlBackground,
  resolveGlRenderTarget,
} from '@flighthq/render-gl';
import type { Camera, GlRenderState, GlRenderTarget, SceneLights, SceneNode } from '@flighthq/types';

import { drawGlScene } from './drawGlScene';

// The default present for drawing a 3D scene WITHOUT the effect pipeline: render `scene` into the
// caller-owned linear render target, then encode the result to the canvas as sRGB. Scene materials
// write linear HDR; drawing that straight to an 8-bit canvas looks dark because gamma is never applied.
// presentGlScene owns that final encode via drawGlLinearToSrgbPass, so a no-effects caller gets correct
// output without hand-rolling a pass. It is an alternative to the effect pipeline, not a companion:
// present a frame with presentGlScene OR the effect pipeline, never both.
//
// `target` is the linear intermediate and stays caller-owned so allocation is explicit: create it once
// via createGlRenderTarget({ width, height, format: 'rgba16f', depth: 'depth-stencil' }) (or 'rgba8' for
// LDR) and resize it to the canvas each frame before calling. presentGlScene clears it to the state's
// background color, clears depth, draws the scene, resolves MSAA if the target is multisampled, and
// presents to the canvas.
export function presentGlScene(
  state: GlRenderState,
  target: GlRenderTarget,
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera>,
  lights: Readonly<SceneLights>,
): void {
  beginGlRenderTarget(state, target, state.renderTransform2D ?? createMatrix());
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  drawGlScene(state, scene, camera, lights);
  endGlRenderTarget(state);

  resolveGlRenderTarget(state, target);
  drawGlLinearToSrgbPass(state, target, null);
}
