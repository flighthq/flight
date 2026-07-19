// One morph target (a.k.a. blend shape / shape key): the per-vertex position/normal/tangent deltas
// added to a mesh's base geometry, scaled by this target's weight. Deltas are de-interleaved (SoA),
// 3 floats per vertex for `positionDeltas`/`normalDeltas` and 3 floats per vertex for
// `tangentDeltas` (the tangent xyz direction only — the handedness `w` is not morphed), each aligned
// index-for-index with the base geometry's vertices. `normalDeltas`/`tangentDeltas` are null when the
// source supplies no delta for that channel (glTF morph targets carry POSITION always, NORMAL/TANGENT
// optionally). The blended vertex is `base + Σ wᵢ·targetᵢ` (an additive `replace`-free blend); see
// blendMeshGeometryMorph in @flighthq/mesh. A target's vertex count matches the base geometry's, so a
// target array is not resizable against its mesh — morph targets are mesh-local by construction.
export interface MorphTarget {
  normalDeltas: Float32Array | null;
  positionDeltas: Float32Array;
  tangentDeltas: Float32Array | null;
}

// A mesh's morph-target set plus its live per-target weight array — the `morph` deformer's data, held
// as the nullable Mesh.morph field (null/absent = no morph, the mesh draws by its base geometry). Each
// `weights[i]` scales `targets[i]`; the two arrays are index-aligned and the same length. A `Weights`
// animation channel writes into `weights` (see applyAnimationClipToScene); the morph deformer reads
// base + Σ weights[i]·targets[i] each frame. `weights` is mutable live state (the animation sink and
// authoring write it); `targets` is immutable delta data captured at build/import time.
export interface MeshMorph {
  targets: readonly MorphTarget[];
  weights: Float32Array;
}
