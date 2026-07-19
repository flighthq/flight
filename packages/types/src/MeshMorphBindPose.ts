// De-interleaved CPU-morph state for one MeshGeometry, captured once from its interleaved vertex
// buffer (captureMeshMorphBindPose) and reused every frame by blendMeshGeometryMorph so the per-frame
// blend allocates nothing. `positions`/`normals`/`tangents` are the immutable base (rest) attributes,
// 3 floats per vertex (the tangent xyz direction only; handedness `w` is not morphed and stays in
// geometry.vertices). `normals`/`tangents` are null when the base layout omits that channel, matching
// which channels the blend rewrites. `blendedPositions`/`blendedNormals`/`blendedTangents` are the
// reusable scratch the blend writes each frame before re-interleaving the result back into
// geometry.vertices (the normal/tangent scratch is null when its base channel is absent). Held on
// MeshGeometryRuntime.morphBindPose, not on the MeshMorph, because it mirrors one geometry's vertex
// buffer, and it is the morph sibling of MeshSkinBindPose.
export interface MeshMorphBindPose {
  blendedNormals: Float32Array | null;
  blendedPositions: Float32Array;
  blendedTangents: Float32Array | null;
  normals: Float32Array | null;
  positions: Float32Array;
  tangents: Float32Array | null;
}
