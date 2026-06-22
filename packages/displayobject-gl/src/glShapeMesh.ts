import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { GlRenderState, RenderProxy2D } from '@flighthq/types';

import { flushGlSpriteBatch } from './glSpriteBatch';

// GPU tessellated solid-fill path for Shape — the replacement for the canvas-raster-to-texture shortcut
// (which is resolution-bound, so circles go jagged when scaled up). Each fill region is tessellated to a
// triangle mesh (CPU, cached by content version in webglShape) and drawn here with a flat-color program,
// transformed by the node world transform in the vertex shader so it stays crisp at any zoom. Gradient/
// bitmap fills and strokes still take the raster path (see getShapeFillRegions returning null).

export interface GlShapeMesh {
  vertices: Float32Array;
  indices: Uint16Array;
  color: number;
  alpha: number;
}

// Draws the shape's tessellated fill meshes. Flushes the sprite batch first (these go through a separate
// program), honors the node blend mode and alpha, and is gated by any active clip stencil (GL state set
// by the clip hooks is left untouched). Records the mesh program as currentProgram so the next content
// draw re-binds its own program (same hazard the clip path guards against).
export function drawGlShapeMeshes(
  state: GlRenderState,
  renderProxy: RenderProxy2D,
  meshes: readonly GlShapeMesh[],
): void {
  if (meshes.length === 0) return;
  const runtime = getGlRenderStateRuntime(state);
  flushGlSpriteBatch(state);

  const gl = state.gl;
  const program = ensureShapeMeshProgram(state);
  gl.useProgram(program.program);
  runtime.currentProgram = program.program;

  state.applyBlendMode?.(state, renderProxy.blendMode);
  gl.uniformMatrix3fv(program.matrixLocation, false, shapeMeshMatrix(state, renderProxy));

  gl.bindBuffer(gl.ARRAY_BUFFER, program.vertexBuffer);
  gl.enableVertexAttribArray(program.positionLocation);
  gl.vertexAttribPointer(program.positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, program.indexBuffer);

  const nodeAlpha = renderProxy.alpha;
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    if (mesh.indices.length === 0) continue;
    const a = mesh.alpha * nodeAlpha;
    if (a <= 0) continue;
    // Premultiplied color for the standard ONE / ONE_MINUS_SRC_ALPHA blend the renderer uses.
    const r = ((mesh.color >> 16) & 0xff) / 255;
    const g = ((mesh.color >> 8) & 0xff) / 255;
    const b = (mesh.color & 0xff) / 255;
    gl.uniform4f(program.colorLocation, r * a, g * a, b * a, a);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STREAM_DRAW);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STREAM_DRAW);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
  }

  gl.disableVertexAttribArray(program.positionLocation);
}

interface ShapeMeshProgram {
  program: WebGLProgram;
  vertexBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  positionLocation: number;
  matrixLocation: WebGLUniformLocation | null;
  colorLocation: WebGLUniformLocation | null;
}

const VERTEX_SOURCE = `
attribute vec2 a_position;
uniform mat3 u_matrix;
void main() {
  vec3 p = u_matrix * vec3(a_position, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SOURCE = `
precision mediump float;
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }
`;

const shapeMeshPrograms = new WeakMap<WebGLRenderingContext, ShapeMeshProgram>();

function ensureShapeMeshProgram(state: GlRenderState): ShapeMeshProgram {
  const gl = state.gl;
  const existing = shapeMeshPrograms.get(gl);
  if (existing !== undefined) return existing;

  const program = compileShapeMeshProgram(gl);
  const created: ShapeMeshProgram = {
    program,
    vertexBuffer: gl.createBuffer()!,
    indexBuffer: gl.createBuffer()!,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    matrixLocation: gl.getUniformLocation(program, 'u_matrix'),
    colorLocation: gl.getUniformLocation(program, 'u_color'),
  };
  shapeMeshPrograms.set(gl, created);
  return created;
}

function compileShapeMeshProgram(gl: WebGLRenderingContext): WebGLProgram {
  const v = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(v, VERTEX_SOURCE);
  gl.compileShader(v);
  const f = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(f, FRAGMENT_SOURCE);
  gl.compileShader(f);
  const program = gl.createProgram()!;
  gl.attachShader(program, v);
  gl.attachShader(program, f);
  gl.linkProgram(program);
  return program;
}

// Column-major mat3 = projection · world transform, mapping shape-local points to clip space — identical
// to the sprite batch's projection so the mesh aligns with everything else.
function shapeMeshMatrix(state: GlRenderState, renderProxy: RenderProxy2D): Float32Array {
  const viewport = getGlRenderStateRuntime(state).renderTargetViewport ?? state.canvas;
  const iw = 2 / (viewport.width || 1);
  const ih = 2 / (viewport.height || 1);
  const t = renderProxy.transform2D;
  // prettier-ignore
  return new Float32Array([
    t.a * iw, -t.b * ih, 0,
    t.c * iw, -t.d * ih, 0,
    t.tx * iw - 1, -t.ty * ih + 1, 1,
  ]);
}
