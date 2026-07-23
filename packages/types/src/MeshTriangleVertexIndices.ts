// Caller-owned result for resolving one logical triangle into vertex indices. Keeping this flat and
// local avoids allocating a tuple for every triangle in bounds, picking, and authoring passes.
export interface MeshTriangleVertexIndices {
  i0: number;
  i1: number;
  i2: number;
}
