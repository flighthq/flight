// Inputs to createMeshGeometryFromAttributes. `positions` is a flat xyz array (3 floats per
// vertex). `normals` (flat xyz) is optional — when omitted, normals are computed from the
// faces. `uvs` (flat uv) is optional. `indices` describes the triangle connectivity; omitted
// for non-indexed geometry.
export interface MeshGeometryFromAttributesOptions {
  indices?: readonly number[] | Uint16Array | Uint32Array | null;
  normals?: readonly number[] | null;
  positions: readonly number[];
  uvs?: readonly number[] | null;
}
