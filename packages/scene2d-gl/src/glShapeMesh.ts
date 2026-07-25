import { createGlProgram } from '@flighthq/render-gl';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { GlRenderState, GlShapeMesh, GlShapeMeshBinding, RenderProxy2D } from '@flighthq/types';

import { flushGlSpriteBatch } from './glSpriteBatch';

// GPU tessellated solid-fill path for Shape — the replacement for the canvas-raster-to-texture shortcut
// (which is resolution-bound, so circles go jagged when scaled up). Each fill region is tessellated to a
// triangle mesh (CPU, cached by content version in webglShape) and drawn here with a flat-color program,
// transformed by the node world transform in the vertex shader so it stays crisp at any zoom. Gradient/
// bitmap fills and strokes still take the raster path (see getShapeFillRegions returning null).

// Draws the shape's tessellated fill meshes through `binding`. Flushes the sprite batch first (these go
// through a separate program), honors the node blend mode and alpha, and is gated by any active clip
// stencil (GL state set by the clip hooks is left untouched). Records the program as currentProgram so
// the next content draw re-binds its own program (same hazard the clip path guards against). Uploads
// premultiplied color per mesh for the standard ONE / ONE_MINUS_SRC_ALPHA blend. `onProgramBound` runs
// after the program and matrix are set but before the draw loop, so a caller can upload extra uniforms
// (the color-adjustment fold sets its tint there) without this base driver knowing about them.
export function drawGlShapeMeshBatch(
  state: GlRenderState,
  renderProxy: RenderProxy2D,
  meshes: readonly GlShapeMesh[],
  binding: Readonly<GlShapeMeshBinding>,
  onProgramBound?: (state: GlRenderState) => void,
): void {
  if (meshes.length === 0) return;
  const runtime = getGlRenderStateRuntime(state);
  flushGlSpriteBatch(state);

  const gl = state.gl;
  gl.useProgram(binding.program);
  runtime.currentProgram = binding.program;

  state.applyBlendMode?.(state, renderProxy.blendMode);
  gl.uniformMatrix3fv(binding.matrixLocation, false, shapeMeshMatrix(state, renderProxy));
  onProgramBound?.(state);

  gl.bindBuffer(gl.ARRAY_BUFFER, binding.vertexBuffer);
  gl.enableVertexAttribArray(binding.positionLocation);
  gl.vertexAttribPointer(binding.positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, binding.indexBuffer);

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
    gl.uniform4f(binding.colorLocation, r * a, g * a, b * a, a);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STREAM_DRAW);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STREAM_DRAW);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
  }

  gl.disableVertexAttribArray(binding.positionLocation);
}

// Draws the shape's tessellated fill meshes. Delegates to the opt-in color-adjustment fold when it is
// installed AND the node carries a color transform, so solid-fill tint stays byte-for-byte with the
// quad-batch path; otherwise runs the lean flat-color program, which never references the tint shader
// (it tree-shakes out with the fold until enableGlColorAdjustment is called).
export function drawGlShapeMeshes(
  state: GlRenderState,
  renderProxy: RenderProxy2D,
  meshes: readonly GlShapeMesh[],
): void {
  if (meshes.length === 0) return;
  const fold = getGlRenderStateRuntime(state).glColorAdjustmentFold;
  if (fold != null && renderProxy.colorTransform != null) {
    fold.drawShapeMeshes(state, renderProxy, meshes);
    return;
  }
  drawGlShapeMeshBatch(state, renderProxy, meshes, ensureGlShapeMeshProgram(state));
}

// The lean flat-color mesh binding for `state`, compiled once per context. The base path and the fold's
// tinted draw (which borrows these shared vertex/index buffers) resolve it here.
export function ensureGlShapeMeshProgram(state: GlRenderState): GlShapeMeshBinding {
  const gl = state.gl;
  const existing = shapeMeshPrograms.get(gl);
  if (existing !== undefined) return existing;

  const program = compileShapeMeshProgram(gl);
  const created: GlShapeMeshBinding = {
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

const shapeMeshPrograms = new WeakMap<WebGLRenderingContext, GlShapeMeshBinding>();

function compileShapeMeshProgram(gl: WebGL2RenderingContext): WebGLProgram {
  return createGlProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE, 'Shape-mesh');
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
