import type { GlFullscreenProgram, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlRenderStateRuntime } from './glRenderState';

// The substrate-level fullscreen-pass primitive: draw a clip-space quad through a fragment shader,
// reading N input textures and writing to a target (or the canvas). Filter and effect recipes draw
// through this; it is not filter-specific. Shaders read inputs via `u_texture0..N-1` (and `u_texture`
// is accepted as an alias for unit 0).

const FULLSCREEN_VERTEX_SRC = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

/** Clears a render target to fully transparent and binds it as the current framebuffer. */
export function clearGlRenderTarget(state: GlRenderState, target: GlRenderTarget): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  if (runtime.currentFramebuffer !== target.framebuffer) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    runtime.currentFramebuffer = target.framebuffer;
  }
  gl.viewport(0, 0, target.width, target.height);
  runtime.renderTargetViewport = { width: target.width, height: target.height };
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  runtime.currentTexture = null;
  runtime.currentBlendMode = null;
}

export function compileGlFullscreenProgram(gl: WebGL2RenderingContext, fragmentSource: string): GlFullscreenProgram {
  const vs = compileGlShader(gl, gl.VERTEX_SHADER, FULLSCREEN_VERTEX_SRC);
  const fs = compileGlShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Fullscreen program link error: ${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const textures: WebGLUniformLocation[] = [];
  for (let i = 0; i < 8; i++) {
    const loc = gl.getUniformLocation(program, `u_texture${i}`);
    if (loc) textures.push(loc);
  }
  const single = gl.getUniformLocation(program, 'u_texture');
  if (textures.length === 0 && single) textures.push(single);

  return {
    program,
    locPosition: gl.getAttribLocation(program, 'a_position'),
    locTexCoord: gl.getAttribLocation(program, 'a_texCoord'),
    texture: textures[0] ?? single!,
    textures,
  };
}

/**
 * Draws a fullscreen pass: binds `inputs[i]` to texture unit i and its `u_texture{i}` sampler, binds
 * `dest` (or the canvas when null), sets normal premultiplied-alpha blending, calls `setUniforms` for
 * per-pass uploads, then draws the quad.
 */
export function drawGlFullscreenPass(
  state: GlRenderState,
  program: Readonly<GlFullscreenProgram>,
  inputs: ReadonlyArray<WebGLTexture>,
  dest: Readonly<GlRenderTarget> | null,
  setUniforms: (gl: WebGL2RenderingContext, program: Readonly<GlFullscreenProgram>) => void,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;

  if (runtime.currentProgram !== program.program) {
    gl.useProgram(program.program);
    runtime.currentProgram = program.program;
  }

  const destFramebuffer = dest?.framebuffer ?? null;
  if (runtime.currentFramebuffer !== destFramebuffer) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, destFramebuffer);
    runtime.currentFramebuffer = destFramebuffer;
  }
  const destWidth = dest?.width ?? state.canvas.width;
  const destHeight = dest?.height ?? state.canvas.height;
  gl.viewport(0, 0, destWidth, destHeight);
  runtime.renderTargetViewport = dest ? { width: destWidth, height: destHeight } : null;

  for (let i = 0; i < inputs.length; i++) {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, inputs[i]);
    if (program.textures[i]) gl.uniform1i(program.textures[i], i);
  }
  gl.activeTexture(gl.TEXTURE0);
  runtime.currentTexture = null;

  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  runtime.currentBlendMode = null;

  setUniforms(gl, program);
  drawGlFullscreenQuad(state, program);
}

function compileGlShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Fullscreen shader compile error: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function drawGlFullscreenQuad(state: GlRenderState, program: Readonly<GlFullscreenProgram>): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const v = runtime.quadVertexData;
  // x, y, u, v per corner — a clip-space quad with bottom-left-origin texcoords.
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

  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.quadVertexBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, runtime.quadIndexBuffer);
  gl.enableVertexAttribArray(program.locPosition);
  gl.enableVertexAttribArray(program.locTexCoord);
  gl.vertexAttribPointer(program.locPosition, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(program.locTexCoord, 2, gl.FLOAT, false, 16, 8);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

  runtime.shaderLoc = runtime.defaultBitmapShader.locations;
}
