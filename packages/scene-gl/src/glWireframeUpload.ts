import type { GlWireframeUpload, GlRenderState, MeshGeometry } from '@flighthq/types';

import { ensureGlMeshUpload } from './glMeshUpload';
// Lazily derives and uploads the wireframe line-index VAO for a geometry on this state, caching it
// keyed by the geometry entity. Reuses the geometry's interleaved vertex buffer (ensuring the
// triangle upload first), binds only the position attribute at location 0, and builds a line-list
// index buffer from the triangle indices. Leaves the wireframe VAO bound on return so the draw path
// issues its gl.LINES draw immediately after. A subset's triangle range [indexOffset, +indexCount)
// maps to the line range [indexOffset * 2, +indexCount * 2) (each triangle index yields two line
// indices), so the renderer draws a sub-range of this buffer.
// Frees the GL objects owned by a wireframe upload — the VAO and the line-index buffer. It does NOT
// delete the vertex buffer: that is the shared triangle upload's buffer (see ensureGlWireframeUpload),
// freed by destroyGlMeshUpload for that geometry, not here. Deleting an already-deleted GL object is
// a silent no-op.
export function destroyGlWireframeUpload(state: GlRenderState, upload: Readonly<GlWireframeUpload>): void {
  const gl = state.gl;
  gl.deleteVertexArray(upload.vao);
  gl.deleteBuffer(upload.lineIndexBuffer);
}

export function ensureGlWireframeUpload(state: GlRenderState, geometry: Readonly<MeshGeometry>): GlWireframeUpload {
  const gl = state.gl;
  const meshUpload = ensureGlMeshUpload(state, geometry);

  let perState = wireframeUploads.get(state);
  if (perState === undefined) {
    perState = new WeakMap();
    wireframeUploads.set(state, perState);
  }

  let upload = perState.get(geometry as MeshGeometry);
  if (upload !== undefined && upload.version === geometry.version) {
    gl.bindVertexArray(upload.vao);
    return upload;
  }

  const lineIndices = buildLineIndices(geometry);
  const indexType = lineIndices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

  if (upload === undefined) {
    upload = {
      indexType,
      lineIndexBuffer: gl.createBuffer()!,
      vao: gl.createVertexArray()!,
      version: -1,
    };
    perState.set(geometry as MeshGeometry, upload);
  }
  upload.indexType = indexType;

  gl.bindVertexArray(upload.vao);

  // Bind the shared interleaved vertex buffer and wire only the position attribute (location 0).
  gl.bindBuffer(gl.ARRAY_BUFFER, meshUpload.vertexBuffer);
  const stride = geometry.layout.stride;
  const position = geometry.layout.attributes.find((a) => a.semantic === 'position');
  const byteOffset = position !== undefined ? position.byteOffset : 0;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, byteOffset);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, upload.lineIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lineIndices, gl.STATIC_DRAW);

  upload.version = geometry.version;
  return upload;
}

// Builds the line-list index array (two indices per triangle edge, three edges per triangle) from a
// geometry's triangle indices, or from a sequential range when the geometry is non-indexed. Promotes
// to Uint32 when any index exceeds the Uint16 range.
function buildLineIndices(geometry: Readonly<MeshGeometry>): Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> {
  const triangleIndices = geometry.indices;
  const triangleCount =
    triangleIndices !== null
      ? Math.floor(triangleIndices.length / 3)
      : Math.floor((geometry.vertices.length * 4) / geometry.layout.stride / 3);

  const lineCount = triangleCount * 6;
  const useUint32 = triangleIndices instanceof Uint32Array || lineCount > 65535;
  const lines = useUint32 ? new Uint32Array(lineCount) : new Uint16Array(lineCount);

  for (let t = 0; t < triangleCount; t++) {
    const base = t * 3;
    const i0 = triangleIndices !== null ? triangleIndices[base] : base;
    const i1 = triangleIndices !== null ? triangleIndices[base + 1] : base + 1;
    const i2 = triangleIndices !== null ? triangleIndices[base + 2] : base + 2;
    const out = t * 6;
    lines[out] = i0;
    lines[out + 1] = i1;
    lines[out + 2] = i1;
    lines[out + 3] = i2;
    lines[out + 4] = i2;
    lines[out + 5] = i0;
  }
  return lines;
}

// Per-state wireframe upload caches, keyed by geometry. Module-local (not a runtime slot) since
// wireframe is the only consumer; the outer WeakMap drops a state's caches when the state is GC'd.
const wireframeUploads = new WeakMap<GlRenderState, WeakMap<MeshGeometry, GlWireframeUpload>>();
