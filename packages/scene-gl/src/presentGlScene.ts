import { beginGlRenderPass, endGlRenderPass, presentGlRenderTarget } from '@flighthq/render-gl';
import type { Camera3D, GlRenderState, GlRenderTarget, SceneLightsLike, SceneNode } from '@flighthq/types';

import { drawGlScene } from './drawGlScene';

// The no-effects 3D path, now a thin composition of the generic pass + present primitives: begin a pass
// (clears color + depth from the target's policy by default), draw the scene, end the pass (restore +
// resolve MSAA), then present (drawGlScene stamped the target 'linear', so present runs the sRGB encode
// to the canvas). It is an alternative to the effect pipeline, not a companion.
//
// This is now trivial enough to inline at the callsite; kept only as a named entry for the common case.
// Note the asymmetry with the old version is gone: there is no presentGlDisplayObject twin, because
// `presentGlRenderTarget` is subject-agnostic — a 2D-offscreen path presents through the very same call.
//
// `target` is the caller-owned linear intermediate: create once via createGlRenderTarget({ width,
// height, format: 'rgba16f', depth: 'depth-stencil', colorSpace: 'linear' }) and resize it to the canvas
// each frame before calling.
export function presentGlScene(
  state: GlRenderState,
  target: GlRenderTarget,
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera3D>,
  lights: Readonly<SceneLightsLike>,
): void {
  beginGlRenderPass(state, target);
  drawGlScene(state, scene, camera, lights);
  endGlRenderPass(state);
  presentGlRenderTarget(state, target);
}
