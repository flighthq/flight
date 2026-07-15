// id Software MD5 wire-format types — the subset @flighthq/scene-formats imports for .md5mesh
// parsing. These are format-internal and not re-exported from the package barrel.

// A single joint in the MD5 skeleton hierarchy.
export interface Md5Joint {
  // Joint name as declared in the joints block.
  name: string;
  // Orientation quaternion (x, y, z, w). The w component is reconstructed from xyz.
  orientationW: number;
  orientationX: number;
  orientationY: number;
  orientationZ: number;
  // Index of the parent joint, -1 for root joints.
  parentIndex: number;
  // Position in model space.
  positionX: number;
  positionY: number;
  positionZ: number;
}

// A single vertex reference within an MD5 mesh section.
export interface Md5Vertex {
  // Number of weights influencing this vertex.
  countWeights: number;
  // Index of the first weight in the mesh's weight array.
  startWeight: number;
  // Texture coordinates.
  u: number;
  v: number;
}

// A single weight binding a vertex to a joint.
export interface Md5Weight {
  // Blend factor for this weight (weights for a vertex sum to 1).
  bias: number;
  // Index of the joint this weight is attached to.
  jointIndex: number;
  // Position offset in joint-local space.
  positionX: number;
  positionY: number;
  positionZ: number;
}

// A parsed mesh section from an MD5 mesh file.
export interface Md5Mesh {
  // Triangle index triples (v0, v1, v2 per triangle).
  indices: readonly number[];
  // Shader/texture name declared by the mesh section.
  shader: string;
  // Per-vertex data.
  vertices: readonly Md5Vertex[];
  // Per-weight data.
  weights: readonly Md5Weight[];
}
