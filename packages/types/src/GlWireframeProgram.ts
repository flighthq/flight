import type { GlMeshProgram } from './GlMeshProgram';

// A compiled wireframe program. Extends GlMeshProgram (model + view-projection; locNormalMatrix is
// null — wireframe has no normals) with the single line-color uniform.
export interface GlWireframeProgram extends GlMeshProgram {
  locColor: WebGLUniformLocation | null;
}

// The wireframe GPU upload of one MeshGeometry: a dedicated VAO binding the geometry's shared
// interleaved vertex buffer (position attribute only) plus a derived LINE index buffer — three edges
// per triangle (i0i1, i1i2, i2i0). Wireframe needs its own VAO because a VAO captures its
// ELEMENT_ARRAY_BUFFER binding; reusing the triangle upload's VAO and swapping the element buffer
// would corrupt the cached triangle draw for every other material. The vertex buffer itself is reused
// from the triangle upload (no duplicate vertex memory). Cached per state + geometry, re-derived when
// geometry.version moves.
export interface GlWireframeUpload {
  indexType: number;
  lineIndexBuffer: WebGLBuffer;
  vao: WebGLVertexArrayObject;
  version: number;
}
