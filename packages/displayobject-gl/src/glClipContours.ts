import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { GlRenderState, Matrix, PathWinding } from '@flighthq/types';

import { flushGlSpriteBatch } from './glSpriteBatch';

// Stencil-then-cover fill of arbitrary flattened contours, used to realize a *path* ClipRegion exactly
// (crisp at any zoom — the contours are transformed in the vertex shader each frame, never cached as a
// texture). This is the contour counterpart to webglClipRectangle's scissor and replaces the old mask
// stencil. It needs no display node — just geometry + a winding rule.
//
// MODEL: a single-level contour clip gates content to the polygon's covered pixels. PHASE 1 accumulates
// the winding into the stencil with color off (non-zero: front/back INCR/DECR_WRAP; even-odd: INVERT);
// PHASE 2 enables color and sets the stencil test so only covered pixels pass (non-zero: != 0; even-odd:
// low bit set). state.currentMaskDepth tracks whether the gate is live (it is the "a stencil test is
// active" signal the rest of the GPU path keys off) and triggers a stencil clear when a sibling clip
// opens at depth 0. Scissor (rect) clips compose independently via the scissor test. Nested *contour*
// clips share one stencil buffer and are not re-derived on pop — nest a contour inside a rect/scissor
// clip when ANDing is needed (documented in popGlClipContours).
//
// Verified via the `mask` functional capture (canvas/dom/webgl agree). The clip program must keep
// state.currentProgram in sync (see pushGlClipContours) so content draws re-bind their own program.

// Position-only program: transform contour points (clip-local) by the node world transform, then by the
// backend's pixels->clip projection. Fragment writes nothing — color is masked off; only stencil moves.
const VERTEX_SOURCE = `
attribute vec2 a_position;
uniform mat3 u_worldMatrix;   // node world transform2D (a,b,c,d,tx,ty) lifted to mat3
uniform mat3 u_projection;    // device pixels -> clip space (same one the sprite/shape shaders use)
void main() {
  vec3 clip = u_projection * (u_worldMatrix * vec3(a_position, 1.0));
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SOURCE = `
precision mediump float;
void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); }
`;

export function popGlClipContours(state: GlRenderState): void {
  flushGlSpriteBatch(state);
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const nextDepth = Math.max(0, (runtime.currentMaskDepth ?? 0) - 1);
  runtime.currentMaskDepth = nextDepth;
  // Single-level contour clips are the common case; the outermost pop turns the stencil gate off. Nested
  // contour clips share one stencil buffer and are not re-derived on pop (a documented limitation — nest
  // a contour inside a rect/scissor clip instead, which composes independently).
  if (nextDepth === 0) {
    gl.disable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
  }
}

export function pushGlClipContours(
  state: GlRenderState,
  contours: readonly (readonly number[])[],
  winding: PathWinding,
  worldTransform: Readonly<Matrix>,
): void {
  flushGlSpriteBatch(state);
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const depth = runtime.currentMaskDepth ?? 0;

  if (depth === 0) {
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
    gl.clear(gl.STENCIL_BUFFER_BIT);
  }

  ensureClipProgram(state);
  const program = clipProgramFor(state);
  gl.useProgram(program.program);
  // Content draws skip gl.useProgram when state.currentProgram already matches their program. Record the
  // clip program here so the next content draw detects the change and re-binds — otherwise it would set
  // its uniforms against the clip program (INVALID_OPERATION: location not from the associated program).
  runtime.currentProgram = program.program;
  uploadClipUniforms(state, program, worldTransform);

  // PHASE 1 — accumulate the polygon's winding into the stencil with color writes off. Non-zero uses
  // separate front/back INCR/DECR_WRAP (interior ends up != 0); even-odd uses INVERT (interior ends odd).
  gl.colorMask(false, false, false, false);
  gl.stencilMask(0xff);
  gl.disable(gl.CULL_FACE); // non-zero needs both faces rasterized; 2D content leaves culling off anyway

  if (winding === 'evenOdd') {
    gl.stencilFunc(gl.ALWAYS, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
  } else {
    gl.stencilFunc(gl.ALWAYS, 0, 0xff);
    gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
    gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
  }
  drawClipContours(state, program, contours);

  // PHASE 2 — enable color and gate subsequent content to the covered pixels: non-zero passes where the
  // accumulated count != 0; even-odd passes where the low bit is set. stencilMask 0 so content cannot
  // disturb the coverage. The gate persists through the content draws until popGlClipContours.
  gl.colorMask(true, true, true, true);
  gl.stencilMask(0x00);
  if (winding === 'evenOdd') {
    gl.stencilFunc(gl.EQUAL, 0x1, 0x1);
  } else {
    gl.stencilFunc(gl.NOTEQUAL, 0x0, 0xff);
  }
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  runtime.currentMaskDepth = depth + 1;
}

// --- program / buffer management (reconcile uniform sources with the real render-state infra) ---

interface ClipProgram {
  program: WebGLProgram;
  buffer: WebGLBuffer;
  positionLocation: number;
  worldMatrixLocation: WebGLUniformLocation | null;
  projectionLocation: WebGLUniformLocation | null;
}

const clipPrograms = new WeakMap<WebGLRenderingContext, ClipProgram>();

function clipProgramFor(state: GlRenderState): ClipProgram {
  return clipPrograms.get(state.gl)!;
}

function ensureClipProgram(state: GlRenderState): void {
  const gl = state.gl;
  if (clipPrograms.has(gl)) return;
  const program = compileProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE);
  clipPrograms.set(gl, {
    program,
    buffer: gl.createBuffer()!,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    worldMatrixLocation: gl.getUniformLocation(program, 'u_worldMatrix'),
    projectionLocation: gl.getUniformLocation(program, 'u_projection'),
  });
}

function compileProgram(gl: WebGLRenderingContext, vertex: string, fragment: string): WebGLProgram {
  const v = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(v, vertex);
  gl.compileShader(v);
  const f = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(f, fragment);
  gl.compileShader(f);
  const program = gl.createProgram()!;
  gl.attachShader(program, v);
  gl.attachShader(program, f);
  gl.linkProgram(program);
  // Query LINK_STATUS before first use: forces an async (KHR_parallel_shader_compile) link to finish so
  // the program is ready for the first draw rather than blanking on a cold GPU, and surfaces a silent
  // link failure as an error.
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Clip-contours program link error: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

function uploadClipUniforms(state: GlRenderState, program: ClipProgram, m: Readonly<Matrix>): void {
  const gl = state.gl;
  // mat3 column-major from Matrix(a,b,c,d,tx,ty).
  // prettier-ignore
  gl.uniformMatrix3fv(program.worldMatrixLocation, false, [m.a, m.b, 0, m.c, m.d, 0, m.tx, m.ty, 1]);
  gl.uniformMatrix3fv(program.projectionLocation, false, getProjectionMat3(state));
}

function drawClipContours(state: GlRenderState, program: ClipProgram, contours: readonly (readonly number[])[]): void {
  const gl = state.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, program.buffer);
  gl.enableVertexAttribArray(program.positionLocation);
  gl.vertexAttribPointer(program.positionLocation, 2, gl.FLOAT, false, 0, 0);
  for (let c = 0; c < contours.length; c++) {
    const contour = contours[c];
    if (contour.length < 6) continue; // need at least a triangle
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(contour), gl.STREAM_DRAW);
    // TRIANGLE_FAN fills the (possibly concave) polygon into the stencil; winding op handles correctness.
    gl.drawArrays(gl.TRIANGLE_FAN, 0, contour.length >> 1);
  }
}

// Device pixels -> clip space for the current viewport / render target. This is the same column-major
// mat3 the sprite/shape batch builds in setGlQuadBatchWorldAndTexture, so a clip's contours and the
// content it clips land in identical clip space (the clip stays pixel-exact under the node transform).
function getProjectionMat3(state: GlRenderState): Float32Array {
  const runtime = getGlRenderStateRuntime(state);
  const w = (runtime.renderTargetViewport ?? state.canvas).width || 1;
  const h = (runtime.renderTargetViewport ?? state.canvas).height || 1;
  // pixels (origin top-left, y down) -> clip space (-1..1, y up)
  // prettier-ignore
  return new Float32Array([2 / w, 0, 0, 0, -2 / h, 0, -1, 1, 1]);
}
