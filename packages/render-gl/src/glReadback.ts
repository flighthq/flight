import type { GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlRenderStateRuntime } from './glRenderState';

// Reads pixel data from a render target's resolve texture into `out`. Binds the resolve
// framebuffer (or the draw framebuffer for single-sample targets) for reading, then calls
// readPixels. Returns false when the framebuffer is incomplete or the target has no texture.
//
// For MSAA targets, call resolveGlRenderTarget before readGlRenderTargetPixels so the
// multisample data is blitted to the resolve texture first.
//
// `out` must be a Uint8Array for rgba8 targets or a Float32Array for rgba16f/rgba32f targets.
// The pixel rectangle must lie within the target dimensions; out-of-bounds reads return zeros.
export function readGlRenderTargetPixels(
  state: GlRenderState,
  target: Readonly<GlRenderTarget>,
  x: number,
  y: number,
  width: number,
  height: number,
  out: Uint8Array | Float32Array,
): boolean {
  if (target.width <= 0 || target.height <= 0) return false;
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  // Read from the resolve framebuffer (single-sample textures) or the draw framebuffer when
  // no resolve pass is needed. The resolve FBO is always texture-backed; the draw FBO for
  // single-sample targets is the same as the texture FBO.
  const readFbo = target.resolveFramebuffer ?? target.framebuffer;
  const prevFbo = runtime.currentFramebuffer;
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readFbo);
  const status = gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevFbo);
    return false;
  }
  const format = gl.RGBA;
  const type = out instanceof Float32Array ? gl.FLOAT : gl.UNSIGNED_BYTE;
  gl.readPixels(x, y, width, height, format, type, out);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevFbo);
  return true;
}
