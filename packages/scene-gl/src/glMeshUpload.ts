import { getMeshGeometrySkinBindPose } from '@flighthq/mesh';
import type { GlRenderState, MeshGeometry, MeshSkinBindPose, VertexAttribute } from '@flighthq/types';

import type { GlMeshUpload } from './glSceneRuntime';
import { getGlSceneRuntime } from './glSceneRuntime';

// Frees the GL objects owned by a mesh upload — the VAO and the vertex/index buffers. The upload
// must not be used after this call. The upload cache is a WeakMap keyed by the geometry entity, so
// its entry falls away on its own once the geometry is GC'd; this frees the GPU resources now rather
// than waiting for context loss. Deleting an already-deleted GL object is a silent no-op.
export function destroyGlMeshUpload(state: GlRenderState, upload: Readonly<GlMeshUpload>): void {
  const gl = state.gl;
  gl.deleteVertexArray(upload.vao);
  gl.deleteBuffer(upload.vertexBuffer);
  if (upload.indexBuffer !== null) gl.deleteBuffer(upload.indexBuffer);
}

// Lazily uploads a MeshGeometry's interleaved vertex buffer + index buffer into a VAO for this
// GlRenderState, caching the result keyed by the geometry entity (the per-state parallel of
// MeshGeometryRuntime.webglData). Re-uploads when geometry.version moves past the cached version,
// reusing the existing GL objects. The VAO binds only the canonical PBR attributes the shader
// consumes (position/normal/tangent/uv0), read from geometry.layout so a custom-offset layout still
// works. Leaves the VAO bound on return (the draw path issues its draws immediately after).
//
// `gpuSkinned` is true when the caller will GPU-skin this geometry (the HAS_SKIN shader deforms it via
// the joint palette). In that case the uploaded buffer is the STATIC bind pose — position/normal
// restored from the captured skin bind pose rather than the per-frame CPU-posed geometry.vertices that
// updateMeshSkin writes — so the GPU deforms bind → pose exactly once, never double-skinning on top of a
// CPU pose. The bind buffer is uploaded once and reused across frames (its version is ignored while
// skinBindUploaded). Without a captured bind pose, geometry.vertices IS the bind pose, so it uploads
// as-is. A rigid draw (not gpuSkinned) always uploads geometry.vertices — for an oversized skeleton that
// falls back to CPU skinning, those are exactly the CPU-posed vertices it must draw.
export function ensureGlMeshUpload(
  state: GlRenderState,
  geometry: Readonly<MeshGeometry>,
  gpuSkinned = false,
): GlMeshUpload {
  const gl = state.gl;
  const cache = getGlSceneRuntime(state).uploadCache;
  let upload = cache.get(geometry as MeshGeometry);

  const bindPose = gpuSkinned ? getMeshGeometrySkinBindPose(geometry) : null;

  if (
    upload !== undefined &&
    (bindPose !== null ? upload.skinBindUploaded === true : upload.version === geometry.version)
  ) {
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
  gl.bufferData(
    gl.ARRAY_BUFFER,
    bindPose !== null ? buildSkinBindVertices(geometry, bindPose) : geometry.vertices,
    gl.STATIC_DRAW,
  );
  upload.skinBindUploaded = bindPose !== null;

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

// Builds the STATIC bind-pose vertex buffer a GPU-skinned mesh uploads: a copy of the interleaved
// buffer with position and normal restored from the captured skin bind pose. tangent/uv0/joints0/
// weights0 are already static (updateMeshSkin rewrites only position/normal), so copying them straight
// from geometry.vertices is correct. The GPU deforms this fixed buffer through the joint palette.
function buildSkinBindVertices(geometry: Readonly<MeshGeometry>, bindPose: Readonly<MeshSkinBindPose>): Float32Array {
  const out = geometry.vertices.slice();
  const floatsPerVertex = geometry.layout.stride / 4;
  const positionOffset = floatOffsetForSemantic(geometry, 'position');
  const normalOffset = floatOffsetForSemantic(geometry, 'normal');
  const { normals, positions } = bindPose;
  const vertexCount = (positions.length / 3) | 0;
  for (let v = 0; v < vertexCount; v++) {
    const base = v * floatsPerVertex;
    const s = v * 3;
    if (positionOffset >= 0) {
      out[base + positionOffset] = positions[s]!;
      out[base + positionOffset + 1] = positions[s + 1]!;
      out[base + positionOffset + 2] = positions[s + 2]!;
    }
    if (normalOffset >= 0) {
      out[base + normalOffset] = normals[s]!;
      out[base + normalOffset + 1] = normals[s + 1]!;
      out[base + normalOffset + 2] = normals[s + 2]!;
    }
  }
  return out;
}

// The float offset (byteOffset / 4) of a semantic within an interleaved vertex record, or -1 when the
// layout does not carry it.
function floatOffsetForSemantic(geometry: Readonly<MeshGeometry>, semantic: string): number {
  const attributes = geometry.layout.attributes;
  for (let i = 0; i < attributes.length; i++) {
    if (attributes[i].semantic === semantic) return attributes[i].byteOffset / 4;
  }
  return -1;
}

// Vertex attribute locations the mesh vertex shaders fix with layout(location = …); the upload's
// VAO wires the interleaved buffer to these by semantic. Locations 0–3 are the canonical PBR record
// (position/normal/tangent/uv0); `color0` (location 4) is bound only when a geometry's layout carries
// it (the VertexColor path); `uv1` (location 5) is the second UV set (occlusion/lightmap channel per
// glTF TEXCOORD_1); `joints0`/`weights0` (locations 6–7) are the skinning channels the HAS_SKIN vertex
// stage reads (see GL_SKIN_VERTEX_DECLARATIONS_GLSL). Semantics absent from a layout are left unbound.
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

function bindGlVertexAttribute(gl: WebGL2RenderingContext, attribute: Readonly<VertexAttribute>, stride: number): void {
  const location = ATTRIBUTE_LOCATION[attribute.semantic];
  if (location === undefined) return;
  const [size, type, normalized] = resolveGlVertexFormat(gl, attribute.format);
  gl.enableVertexAttribArray(location);
  // Every built-in mesh shader declares these locations as float/vec inputs. WebGL therefore needs
  // vertexAttribPointer even when storage is integer: it converts uint joints to float values and
  // normalizes unorm weights/colors. vertexAttribIPointer is only valid for ivec/uvec shader inputs
  // and creates a link/input-type mismatch here.
  gl.vertexAttribPointer(location, size, type, normalized, stride, attribute.byteOffset);
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
