// De-interleaved CPU-skinning state for one MeshGeometry, captured once from its interleaved vertex
// buffer (captureMeshSkinBindPose) and reused every frame by skinMeshGeometry so the per-frame
// deform allocates nothing. `positions`/`normals` are the immutable bind-pose (rest) attributes,
// 3 floats per vertex; `joints`/`weights` are the static 4-influence skin binding, 4 values per
// vertex (joint indices carried as integer-valued floats, aligned with `weights`).
// `tangents` are the bind-pose tangents, 4 floats per vertex: xyz is the direction and w is the
// HANDEDNESS SIGN, which is carried through skinning unchanged rather than transformed. Both tangent
// arrays are zero-length when the geometry's layout carries no tangent semantic, so the deform loops
// over nothing rather than over meaningless zeros.
// `skinnedPositions`/`skinnedNormals` are reusable scratch the deform writes each frame before
// re-interleaving the result back into geometry.vertices. Held on MeshGeometryRuntime.skinBindPose,
// not on the Skin entity, because it mirrors one geometry's vertex buffer rather than the shared
// skeleton — two meshes skinned by the same skeleton each keep their own bind pose here.
export interface MeshSkinBindPose {
  joints: Float32Array;
  normals: Float32Array;
  positions: Float32Array;
  skinnedNormals: Float32Array;
  skinnedPositions: Float32Array;
  skinnedTangents: Float32Array;
  tangents: Float32Array;
  weights: Float32Array;
}
