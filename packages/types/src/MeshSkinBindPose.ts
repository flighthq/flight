// De-interleaved CPU-skinning state for one MeshGeometry, captured once from its interleaved vertex
// buffer (captureMeshSkinBindPose) and reused every frame by skinMeshGeometry so the per-frame
// deform allocates nothing. `positions`/`normals` are the immutable bind-pose (rest) attributes,
// 3 floats per vertex; `joints`/`weights` are the static 4-influence skin binding, 4 values per
// vertex (joint indices carried as integer-valued floats, aligned with `weights`).
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
  weights: Float32Array;
}
