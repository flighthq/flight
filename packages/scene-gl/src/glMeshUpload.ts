import type { GlRenderState, MeshGeometry, VertexAttribute } from '@flighthq/types';

import type { GlMeshUpload } from './glSceneRuntime';
import { getGlSceneRuntime } from './glSceneRuntime';

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

// Vertex attribute locations the mesh vertex shaders fix with layout(location = …); the upload's
// VAO wires the interleaved buffer to these by semantic. Locations 0–3 are the canonical PBR record
// (position/normal/tangent/uv0); `color0` (location 4) is bound only when a geometry's layout carries
// it (the VertexColor path); `uv1` (location 5) is the second UV set (occlusion/lightmap channel per
// glTF TEXCOORD_1); `joints0`/`weights0` (locations 6–7) are the skinning channels (reserved for a
// future GPU-skinning pass). Semantics absent from a geometry's layout are simply left unbound.
const ATTRIBUTE_LOCATION: Readonly<Record<string, number>> = {
  color0: 4,
  joints0: 6,
  normal: 1,
  position: 0,
  tangent: 2,
  uv0: 3,
  uv1: 5,
  weights0: 7,
};

// Returns true when a MeshGeometry's vertex layout contains a `uv1` semantic (glTF TEXCOORD_1).
// Used by material renderers to drive the `hasUv1` flag in GlPbrDefineKey at bind time, so the
// compiled shader variant matches the actual geometry layout without the caller needing to know.
// A geometry without `uv1` in its layout will have location 5 unbound; the shader path is
// disabled (#ifndef HAS_UV1) and the attribute reads zero — safe but wasted sampler. Pass the
// result to buildGlPbrStandardDefineKey as the `hasUv1` argument.
export function hasGlMeshGeometryUv1(geometry: Readonly<MeshGeometry>): boolean {
  const attributes = geometry.layout.attributes;
  for (let i = 0; i < attributes.length; i++) {
    if (attributes[i].semantic === 'uv1') return true;
  }
  return false;
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
