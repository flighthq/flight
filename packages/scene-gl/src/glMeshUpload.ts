import type { GlRenderState, MeshGeometry, VertexAttribute } from '@flighthq/types';

import type { GlMeshUpload } from './glSceneRuntime';
import { getGlSceneRuntime } from './glSceneRuntime';

// Vertex attribute locations the PBR vertex shader fixes with layout(location = …); the upload's
// VAO wires the interleaved buffer to these by semantic.
const ATTRIBUTE_LOCATION: Readonly<Record<string, number>> = {
  position: 0,
  normal: 1,
  tangent: 2,
  uv0: 3,
};

// Lazily uploads a MeshGeometry's interleaved vertex buffer + index buffer into a VAO for this
// GlRenderState, caching the result keyed by the geometry entity (the per-state parallel of
// MeshGeometryRuntime.webglData). Re-uploads when geometry.version moves past the cached version,
// reusing the existing GL objects. The VAO binds only the canonical PBR attributes the shader
// consumes (position/normal/tangent/uv0), read from geometry.layout so a custom-offset layout still
// works. Leaves the VAO bound on return (the draw path issues its draws immediately after).
export function ensureGlMeshUpload(state: GlRenderState, geometry: Readonly<MeshGeometry>): GlMeshUpload {
  const gl = state.gl;
  const cache = getGlSceneRuntime(state).uploadCache;
  let upload = cache.get(geometry as MeshGeometry);

  if (upload !== undefined && upload.version === geometry.version) {
    gl.bindVertexArray(upload.vao);
    return upload;
  }

  if (upload === undefined) {
    upload = {
      indexBuffer: null,
      indexCount: 0,
      indexType: gl.UNSIGNED_SHORT,
      vao: gl.createVertexArray()!,
      version: -1,
      vertexBuffer: gl.createBuffer()!,
    };
    cache.set(geometry as MeshGeometry, upload);
  }

  gl.bindVertexArray(upload.vao);

  gl.bindBuffer(gl.ARRAY_BUFFER, upload.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW);

  const stride = geometry.layout.stride;
  for (let i = 0; i < geometry.layout.attributes.length; i++) {
    bindGlVertexAttribute(gl, geometry.layout.attributes[i], stride);
  }

  if (geometry.indices !== null) {
    if (upload.indexBuffer === null) upload.indexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, upload.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
    upload.indexType = geometry.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    upload.indexCount = geometry.indices.length;
  } else {
    upload.indexBuffer = null;
    upload.indexCount = 0;
  }

  upload.version = geometry.version;
  return upload;
}

function bindGlVertexAttribute(gl: WebGL2RenderingContext, attribute: Readonly<VertexAttribute>, stride: number): void {
  const location = ATTRIBUTE_LOCATION[attribute.semantic];
  if (location === undefined) return;
  const [size, type, normalized] = resolveGlVertexFormat(gl, attribute.format);
  gl.enableVertexAttribArray(location);
  if (type === gl.FLOAT) {
    gl.vertexAttribPointer(location, size, type, normalized, stride, attribute.byteOffset);
  } else {
    gl.vertexAttribIPointer(location, size, type, stride, attribute.byteOffset);
  }
}

// Maps a VertexFormat to its [componentCount, glType, normalized] tuple. The canonical PBR record
// is all float32, but the data path may carry packed integer/unorm attributes for later passes.
function resolveGlVertexFormat(gl: WebGL2RenderingContext, format: string): [number, number, boolean] {
  switch (format) {
    case 'float32x2':
      return [2, gl.FLOAT, false];
    case 'float32x3':
      return [3, gl.FLOAT, false];
    case 'float32x4':
      return [4, gl.FLOAT, false];
    case 'uint8x4':
      return [4, gl.UNSIGNED_BYTE, false];
    case 'unorm8x4':
      return [4, gl.UNSIGNED_BYTE, true];
    case 'uint16x4':
      return [4, gl.UNSIGNED_SHORT, false];
    default:
      return [3, gl.FLOAT, false];
  }
}
