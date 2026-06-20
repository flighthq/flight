import { clearWebGLRenderTarget, compileWebGLFullscreenProgram, drawWebGLFullscreenPass } from '@flighthq/render-webgl';
import type { WebGLFullscreenProgram, WebGLRenderState, WebGLRenderTarget } from '@flighthq/types';

// Filter passes are the substrate-level fullscreen primitive (compile a fragment program, draw a
// clip-space quad reading N input textures). That primitive lives once in @flighthq/render-webgl
// (webglFullscreenPass); this module is a thin compatibility surface that keeps the filter recipes'
// existing call shape — single-source and dual-source draws — over it. No pass logic is duplicated.

export type WebGLFilterLocations = WebGLFullscreenProgram;

export type WebGLDualSourceLocations = WebGLFullscreenProgram & {
  locTexture2: WebGLUniformLocation;
};

/** Clears a render target to fully transparent. */
export const clearWebGLFilterTarget = clearWebGLRenderTarget;

/** Compiles the fullscreen-quad vertex shader linked to `fragmentSrc`; resolves attribute/sampler locations. */
export const compileWebGLFilterProgram = compileWebGLFullscreenProgram;

/**
 * Draws a full-screen filter pass reading two source textures. source0 binds to unit 0 (`u_texture`),
 * source1 to unit 1 (`u_texture2`). The second sampler is set here since it is filter-specific naming
 * the generic primitive does not know about.
 */
export function drawWebGLDualSourcePass(
  state: WebGLRenderState,
  source0: WebGLRenderTarget,
  source1: WebGLRenderTarget,
  dest: WebGLRenderTarget | null,
  locations: WebGLDualSourceLocations,
  setUniforms: (gl: WebGL2RenderingContext) => void,
): void {
  drawWebGLFullscreenPass(state, locations, [source0.texture, source1.texture], dest, (gl) => {
    gl.uniform1i(locations.locTexture2, 1);
    setUniforms(gl);
  });
}

/**
 * Draws a full-screen filter pass: reads `source` into unit 0, writes to `dest` (or the canvas when
 * null). `setUniforms` uploads per-pass uniforms while the program is active.
 */
export function drawWebGLFilterPass(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget | null,
  locations: WebGLFilterLocations,
  setUniforms: (gl: WebGL2RenderingContext) => void,
): void {
  drawWebGLFullscreenPass(state, locations, [source.texture], dest, (gl) => setUniforms(gl));
}
