/**
 * A triangulated fill produced from a `Path` using typed arrays for zero-copy GPU upload.
 * Vertices are x,y pairs in a `Float32Array`; triangle indices (three per triangle) are in a
 * `Uint32Array`. Use `tessellatePathTyped` to produce this form when uploading to a GPU buffer.
 * The parallel `PathMesh` type uses `number[]` and is the default for non-GPU consumers.
 */
export interface PathMeshTyped {
  vertices: Float32Array;
  indices: Uint32Array;
}
