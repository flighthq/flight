import type { WebGLRenderStateInternal } from '@flighthq/render-webgl';
import type { WebGLRenderTarget } from '@flighthq/render-webgl';
import type { WebGLRenderState } from '@flighthq/types';

// Filter vertex shader uses clip-space positions directly (no matrix transform).
// Texcoord (0,0) = GL bottom-left; (1,1) = GL top-right.
const FILTER_VERTEX_SRC = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

export type WebGLFilterLocations = {
  program: WebGLProgram;
  locPosition: number;
  locTexCoord: number;
  locTexture: WebGLUniformLocation;
};

export type WebGLDualSourceLocations = WebGLFilterLocations & {
  locTexture2: WebGLUniformLocation;
};

/** Clears a render target to fully transparent. */
export function clearWebGLFilterTarget(state: WebGLRenderState, target: WebGLRenderTarget): void {
  const internal = state as WebGLRenderStateInternal;
  const { gl } = internal;
  if (internal.currentFramebuffer !== target.framebuffer) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    internal.currentFramebuffer = target.framebuffer;
  }
  gl.viewport(0, 0, target.width, target.height);
  internal.renderTargetViewport = { width: target.width, height: target.height };
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  state.currentTexture = null;
  state.currentBlendMode = null;
}

export function compileWebGLFilterProgram(gl: WebGL2RenderingContext, fragmentSrc: string): WebGLFilterLocations {
  const vs = compileShader(gl, gl.VERTEX_SHADER, FILTER_VERTEX_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Filter program link error: ${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return {
    program,
    locPosition: gl.getAttribLocation(program, 'a_position'),
    locTexCoord: gl.getAttribLocation(program, 'a_texCoord'),
    locTexture: gl.getUniformLocation(program, 'u_texture')!,
  };
}

/**
 * Draws a full-screen pass reading from two source textures.
 * source0 binds to unit 0 (`u_texture`), source1 to unit 1 (`u_texture2`).
 * Restores the active texture unit to TEXTURE0 on exit.
 */
export function drawWebGLDualSourcePass(
  state: WebGLRenderState,
  source0: WebGLRenderTarget,
  source1: WebGLRenderTarget,
  dest: WebGLRenderTarget | null,
  locations: WebGLDualSourceLocations,
  setUniforms: (gl: WebGL2RenderingContext) => void,
): void {
  const internal = state as WebGLRenderStateInternal;
  const { gl } = internal;

  if (state.currentProgram !== locations.program) {
    gl.useProgram(locations.program);
    state.currentProgram = locations.program;
  }

  const destFramebuffer = dest?.framebuffer ?? null;
  if (internal.currentFramebuffer !== destFramebuffer) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, destFramebuffer);
    internal.currentFramebuffer = destFramebuffer;
  }
  const destWidth = dest?.width ?? state.canvas.width;
  const destHeight = dest?.height ?? state.canvas.height;
  gl.viewport(0, 0, destWidth, destHeight);
  internal.renderTargetViewport = dest ? { width: destWidth, height: destHeight } : null;

  gl.activeTexture(gl.TEXTURE0);
  if (state.currentTexture !== source0.texture) {
    gl.bindTexture(gl.TEXTURE_2D, source0.texture);
    state.currentTexture = source0.texture;
  }
  gl.uniform1i(locations.locTexture, 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, source1.texture);
  gl.uniform1i(locations.locTexture2, 1);
  gl.activeTexture(gl.TEXTURE0);

  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  state.currentBlendMode = null;

  setUniforms(gl);

  drawFilterQuad(internal, locations);
}

/**
 * Draws a full-screen filter pass: reads source into unit 0, writes to dest.
 * `setUniforms` is called while the program is active for per-pass uniform uploads.
 * Blend is set to normal premultiplied-alpha compositing (ONE, ONE_MINUS_SRC_ALPHA).
 */
export function drawWebGLFilterPass(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget | null,
  locations: WebGLFilterLocations,
  setUniforms: (gl: WebGL2RenderingContext) => void,
): void {
  const internal = state as WebGLRenderStateInternal;
  const { gl } = internal;

  if (state.currentProgram !== locations.program) {
    gl.useProgram(locations.program);
    state.currentProgram = locations.program;
  }

  const destFramebuffer = dest?.framebuffer ?? null;
  if (internal.currentFramebuffer !== destFramebuffer) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, destFramebuffer);
    internal.currentFramebuffer = destFramebuffer;
  }
  const destWidth = dest?.width ?? state.canvas.width;
  const destHeight = dest?.height ?? state.canvas.height;
  gl.viewport(0, 0, destWidth, destHeight);
  internal.renderTargetViewport = dest ? { width: destWidth, height: destHeight } : null;

  gl.activeTexture(gl.TEXTURE0);
  if (state.currentTexture !== source.texture) {
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    state.currentTexture = source.texture;
  }
  gl.uniform1i(locations.locTexture, 0);

  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  state.currentBlendMode = null;

  setUniforms(gl);

  drawFilterQuad(internal, locations);
}

function drawFilterQuad(internal: WebGLRenderStateInternal, locations: WebGLFilterLocations): void {
  const { gl } = internal;
  const v = internal.quadVertexData;
  v[0] = -1;
  v[1] = -1;
  v[2] = 0;
  v[3] = 0;
  v[4] = 1;
  v[5] = -1;
  v[6] = 1;
  v[7] = 0;
  v[8] = 1;
  v[9] = 1;
  v[10] = 1;
  v[11] = 1;
  v[12] = -1;
  v[13] = 1;
  v[14] = 0;
  v[15] = 1;

  gl.bindBuffer(gl.ARRAY_BUFFER, internal.quadVertexBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, internal.quadIndexBuffer);

  gl.enableVertexAttribArray(locations.locPosition);
  gl.enableVertexAttribArray(locations.locTexCoord);
  gl.vertexAttribPointer(locations.locPosition, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(locations.locTexCoord, 2, gl.FLOAT, false, 16, 8);

  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

  internal.shaderLoc = internal.defaultBitmapShader.locations;
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Filter shader compile error: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}
