import type {
  GlContext,
  GlFullscreenProgram,
  GlRenderState,
  GlRenderTarget,
  RectangleLike,
  RenderTargetClear,
} from '@flighthq/types/contract';

import { applyGlBlendMode } from './glDraw';
import { createGlProgram } from './glProgram';
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

// Clears a render target using `color` (broadcast to every color attachment) plus optional depth
// and stencil. Color values are float RGBA written directly to the framebuffer — no conversion.
// Self-contained: temporarily disables scissor and enables depth writes so the clear covers the
// full target regardless of inherited GL state. Both are restored before returning.
export function clearGlRenderTarget(
  state: GlRenderState,
  target: GlRenderTarget,
  clear: Readonly<RenderTargetClear>,
): void {
  const gl = state.gl;
  bindGlRenderTarget(state, target);

  const { color, depth, stencil } = clear;

  const scissorWas = gl.isEnabled(gl.SCISSOR_TEST);
  if (scissorWas) gl.disable(gl.SCISSOR_TEST);

  if (color !== undefined) {
    _clearRgba[0] = color[0];
    _clearRgba[1] = color[1];
    _clearRgba[2] = color[2];
    _clearRgba[3] = color[3];
    for (let i = 0; i < target.colorAttachments; i++) {
      gl.clearBufferfv(gl.COLOR, i, _clearRgba);
    }
  }

  clearGlDepthStencil(gl, depth, stencil, true);

  if (scissorWas) gl.enable(gl.SCISSOR_TEST);

  const runtime = getGlRenderStateRuntime(state);
  runtime.context.currentTextureRealization = null;
  runtime.context.currentBlendSignature = null;
}

// Per-attachment clear for MRT targets. Each entry in `colors` is a float RGBA tuple or undefined
// (preserve that attachment). Self-contained like clearGlRenderTarget.
export function clearGlRenderTargetAttachments(
  state: GlRenderState,
  target: GlRenderTarget,
  clear: Readonly<RenderTargetClear>,
): void {
  const gl = state.gl;
  bindGlRenderTarget(state, target);

  const { colors, depth, stencil } = clear;

  const scissorWas = gl.isEnabled(gl.SCISSOR_TEST);
  if (scissorWas) gl.disable(gl.SCISSOR_TEST);

  if (colors !== undefined) {
    for (let i = 0; i < colors.length; i++) {
      const rgba = colors[i];
      if (rgba === undefined) continue;
      _clearRgba[0] = rgba[0];
      _clearRgba[1] = rgba[1];
      _clearRgba[2] = rgba[2];
      _clearRgba[3] = rgba[3];
      gl.clearBufferfv(gl.COLOR, i, _clearRgba);
    }
  }

  clearGlDepthStencil(gl, depth, stencil, true);

  if (scissorWas) gl.enable(gl.SCISSOR_TEST);

  const runtime = getGlRenderStateRuntime(state);
  runtime.context.currentTextureRealization = null;
  runtime.context.currentBlendSignature = null;
}

export function compileGlFullscreenProgram(gl: GlContext, fragmentSource: string): GlFullscreenProgram {
  const program = createGlProgram(gl, FULLSCREEN_VERTEX_SRC, fragmentSource, 'Fullscreen pass');

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
  setUniforms: (gl: GlContext, program: Readonly<GlFullscreenProgram>) => void,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;

  if (runtime.context.currentShader?.program !== program.program) {
    gl.useProgram(program.program);
  }
  runtime.context.currentShader = { locations: null, program: program.program };

  bindGlRenderTarget(state, dest);

  for (let i = 0; i < inputs.length; i++) {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, inputs[i]);
    if (program.textures[i]) gl.uniform1i(program.textures[i], i);
  }
  gl.activeTexture(gl.TEXTURE0);
  runtime.context.currentTextureRealization = null;

  // The fixed-function state this quad's result depends on, owned rather than inherited. Everything
  // below was previously whatever the last draw happened to leave, and each one has a way to silently
  // void the pass rather than error:
  //
  // BLEND — `applyGlBlendMode` sets the equation and factors but never the enable bit, so the pass took
  // it from the single `gl.enable(gl.BLEND)` in `createGlRenderState`. `drawGlScene3D` ends its
  // blended-subset pass with `gl.disable(gl.BLEND)` and never re-enables it, so a present or effect pass
  // after a 3D scene composited unblended while its factors said otherwise.
  //
  // DEPTH — a 3D scene leaves GL_DEPTH_TEST on with GL_LESS and depth writes on, and the DEFAULT
  // framebuffer is the one surface nothing clears between frames. The present quad passed on frame one,
  // wrote its own depth, and was rejected at that same depth forever after: the canvas froze on frame
  // one while the scene kept drawing correctly behind it.
  //
  // CULL_FACE — the quad is wound CCW and survived an inherited cull only because `glMeshProgram`
  // restores FRONT_FACE to CCW after every mesh draw. Its comment records what happens otherwise: a CW
  // winding left behind a mirrored mesh culls this pass and the frame comes back blank. Disabling the
  // capability here retires that cross-package invariant instead of depending on it.
  //
  // All three are restored afterwards, because the pass runs mid-frame: an effect chain puts several of
  // these between scene draws, and a 3D draw resuming with depth or culling silently off renders wrong.
  const blendEnabled = gl.isEnabled(gl.BLEND);
  const cullFaceEnabled = gl.isEnabled(gl.CULL_FACE);
  const depthTestEnabled = gl.isEnabled(gl.DEPTH_TEST);
  const depthWriteEnabled = gl.getParameter(gl.DEPTH_WRITEMASK) !== false;
  if (!blendEnabled) gl.enable(gl.BLEND);
  if (cullFaceEnabled) gl.disable(gl.CULL_FACE);
  if (depthTestEnabled) gl.disable(gl.DEPTH_TEST);
  if (depthWriteEnabled) gl.depthMask(false);

  runtime.context.currentBlendSignature = null;
  applyGlBlendMode(state, null);

  setUniforms(gl, program);
  drawGlFullscreenQuad(state, program);

  runtime.context.currentBlendSignature = null;
  applyGlBlendMode(state, null);
  // Restored after the trailing blend-mode apply so the caller gets back the enable bit it had. The
  // blend FACTORS are deliberately left at NORMAL — that is this function's pre-existing contract,
  // tracked through `currentBlendSignature`; the host bracket is what restores factors at the boundary.
  if (depthWriteEnabled) gl.depthMask(true);
  if (depthTestEnabled) gl.enable(gl.DEPTH_TEST);
  if (cullFaceEnabled) gl.enable(gl.CULL_FACE);
  if (!blendEnabled) gl.disable(gl.BLEND);

  // Unbind the sampled inputs. A fullscreen pass frequently reads a render target's own texture and
  // presents it; leaving that texture bound lets the NEXT draw that renders back into that target form
  // a framebuffer/active-texture feedback loop (e.g. a 3D scene re-rendered into a reused present
  // target whose material leaves this unit untouched). The pass owns the hazard, so it clears it.
  for (let i = 0; i < inputs.length; i++) {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  gl.activeTexture(gl.TEXTURE0);
}

// Draws a solid-color rectangle into the currently bound framebuffer. A rendering primitive — unlike
// clear, this is a draw call that participates in the current blend mode and scissor state. When
// `rect` is omitted the fill covers the full viewport. Color is a packed sRGB RGBA integer.
export function fillGlRect(state: GlRenderState, color: number, rect?: Readonly<RectangleLike>): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;

  let program = _fillPrograms.get(gl);
  if (program === undefined) {
    program = compileFillProgram(gl);
    _fillPrograms.set(gl, program);
    runtime.context.teardowns.push((ownerGl) => ownerGl.deleteProgram(program!.glProgram));
  }

  if (runtime.context.currentShader?.program !== program.fullscreen.program) {
    gl.useProgram(program.fullscreen.program);
  }
  runtime.context.currentShader = { locations: null, program: program.fullscreen.program };

  const r = ((color >>> 24) & 0xff) / 255;
  const g = ((color >>> 16) & 0xff) / 255;
  const b = ((color >>> 8) & 0xff) / 255;
  const a = (color & 0xff) / 255;
  gl.uniform4f(program.locColor, r, g, b, a);

  const useScissor = rect !== undefined;
  let scissorWasEnabled = false;
  if (useScissor) {
    scissorWasEnabled = gl.isEnabled(gl.SCISSOR_TEST);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(rect.x, rect.y, rect.width, rect.height);
  }

  const blendEnabled = gl.isEnabled(gl.BLEND);
  const depthTestEnabled = gl.isEnabled(gl.DEPTH_TEST);
  if (!blendEnabled) gl.enable(gl.BLEND);
  if (depthTestEnabled) gl.disable(gl.DEPTH_TEST);

  runtime.context.currentBlendSignature = null;
  applyGlBlendMode(state, null);

  drawGlFullscreenQuad(state, program.fullscreen);

  runtime.context.currentBlendSignature = null;

  if (depthTestEnabled) gl.enable(gl.DEPTH_TEST);
  if (!blendEnabled) gl.disable(gl.BLEND);
  if (useScissor && !scissorWasEnabled) gl.disable(gl.SCISSOR_TEST);
}

function drawGlFullscreenQuad(state: GlRenderState, program: Readonly<GlFullscreenProgram>): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;

  // Bind a dedicated VAO before touching buffer/attribute state. Without it the quad's ARRAY_BUFFER,
  // ELEMENT_ARRAY_BUFFER, and vertexAttribPointer writes land in whatever VAO happens to be bound —
  // typically the last mesh VAO left bound by a 3D scene draw — silently corrupting that cached VAO
  // (its index buffer becomes this 6-index quad buffer). The next frame redraws that mesh through its
  // poisoned VAO and gl.drawElements reports "Insufficient buffer size". Isolating to our own VAO keeps
  // fullscreen state from leaking into (or out of) any caller's VAO.
  let quadVao = _quadVaos.get(gl);
  if (quadVao === undefined) {
    quadVao = gl.createVertexArray()!;
    _quadVaos.set(gl, quadVao);
    runtime.context.teardowns.push((ownerGl) => ownerGl.deleteVertexArray(quadVao!));
  }
  gl.bindVertexArray(quadVao);

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

  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.context.quadVertexBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, runtime.context.quadIndexBuffer);
  gl.enableVertexAttribArray(program.locPosition);
  gl.enableVertexAttribArray(program.locTexCoord);
  gl.vertexAttribPointer(program.locPosition, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(program.locTexCoord, 2, gl.FLOAT, false, 16, 8);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

  // Restore the default VAO so a later mesh draw that forgets to bind its own VAO cannot accidentally
  // inherit the quad's attribute state, and so nothing observes our dedicated VAO as "current".
  gl.bindVertexArray(null);
}

// Binds a render target (or the canvas when null) as the active framebuffer, sets its full viewport,
// and synchronizes the runtime tracking fields. Shared by clearGlRenderTarget and drawGlFullscreenPass.
function bindGlRenderTarget(state: GlRenderState, target: Readonly<GlRenderTarget> | null): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const framebuffer = target?.framebuffer ?? null;
  if (runtime.currentFramebuffer !== framebuffer) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    runtime.currentFramebuffer = framebuffer;
  }
  const width = target?.width ?? gl.drawingBufferWidth;
  const height = target?.height ?? gl.drawingBufferHeight;
  gl.viewport(0, 0, width, height);
  runtime.renderTargetViewport = target ? { height, width, x: 0, y: 0 } : null;
}

// Clears depth and/or stencil aspects. When `saveRestore` is true, saves and restores the depth write
// mask (for standalone clears outside a pass). The pass calls with false since it owns depthMask.
function clearGlDepthStencil(
  gl: GlContext,
  depth: number | undefined,
  stencil: number | undefined,
  saveRestore: boolean,
): void {
  const depthMaskWas = saveRestore && depth !== undefined ? gl.getParameter(gl.DEPTH_WRITEMASK) !== false : true;
  if (depth !== undefined && stencil !== undefined) {
    if (!depthMaskWas) gl.depthMask(true);
    gl.clearBufferfi(gl.DEPTH_STENCIL, 0, depth, stencil);
  } else if (depth !== undefined) {
    if (!depthMaskWas) gl.depthMask(true);
    _clearDepth[0] = depth;
    gl.clearBufferfv(gl.DEPTH, 0, _clearDepth);
  } else if (stencil !== undefined) {
    _clearStencil[0] = stencil;
    gl.clearBufferiv(gl.STENCIL, 0, _clearStencil);
  }
  if (saveRestore && !depthMaskWas) gl.depthMask(false);
}

const _quadVaos = new WeakMap<GlContext, WebGLVertexArrayObject>();
const _clearRgba = new Float32Array(4);
const _clearDepth = new Float32Array(1);
const _clearStencil = new Int32Array(1);

interface FillProgram {
  readonly fullscreen: GlFullscreenProgram;
  readonly glProgram: WebGLProgram;
  readonly locColor: WebGLUniformLocation;
}

const FILL_FRAGMENT_SRC = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 o_color;
void main() {
  o_color = u_color;
}`;

function compileFillProgram(gl: GlContext): FillProgram {
  const fullscreen = compileGlFullscreenProgram(gl, FILL_FRAGMENT_SRC);
  return {
    fullscreen,
    glProgram: fullscreen.program,
    locColor: gl.getUniformLocation(fullscreen.program, 'u_color')!,
  };
}

const _fillPrograms = new WeakMap<GlContext, FillProgram>();
