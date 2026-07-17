// glTF 2.0 JSON wire-format schema — the subset @flighthq/scene-formats imports today (node hierarchy
// + mesh geometry from embedded base64 or GLB-binary buffers). Field names match the glTF 2.0 spec
// exactly. Indices into the document's parallel arrays are the spec's referencing model.
//
// These wire types are format-internal: only `GltfDocument` is re-exported from the package barrel (it
// is the public input shape of `createSceneFromGltf`); the rest stay module-internal to the package.

export interface GltfDocument {
  asset?: { version: string };
  scene?: number;
  scenes?: GltfScene[];
  nodes?: GltfNode[];
  meshes?: GltfMesh[];
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  buffers?: GltfBuffer[];
  skins?: GltfSkin[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}

export interface GltfScene {
  name?: string;
  nodes?: number[];
}

export interface GltfNode {
  name?: string;
  children?: number[];
  mesh?: number;
  // Index into `GltfDocument.skins` — set on a node that instances `mesh` as a skinned mesh.
  skin?: number;
  // A node carries EITHER a 16-element column-major `matrix` OR separate TRS components.
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}

// A glTF skin: the ordered joint (bone) nodes, their inverse-bind matrices accessor (one MAT4 per
// joint, column-major), and the optional common-root node the joints hang under. A primitive's
// JOINTS_0 indices are positions into `joints`.
export interface GltfSkin {
  name?: string;
  inverseBindMatrices?: number;
  joints: number[];
  skeleton?: number;
}

export interface GltfMesh {
  name?: string;
  primitives: GltfPrimitive[];
}

export interface GltfPrimitive {
  attributes: {
    JOINTS_0?: number;
    NORMAL?: number;
    POSITION?: number;
    TANGENT?: number;
    TEXCOORD_0?: number;
    WEIGHTS_0?: number;
  };
  indices?: number;
  material?: number;
  // Primitive topology (GL constant). Absent means 4 (TRIANGLES).
  mode?: number;
}

// glTF accessor `componentType` values (GL constants).
export type GltfComponentType = 5120 | 5121 | 5122 | 5123 | 5125 | 5126;

export interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: GltfComponentType;
  count: number;
  normalized?: boolean;
  type: 'MAT2' | 'MAT3' | 'MAT4' | 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4';
}

export interface GltfBufferView {
  buffer: number;
  byteLength: number;
  byteOffset?: number;
  byteStride?: number;
}

export interface GltfBuffer {
  byteLength: number;
  // Absent when the buffer's bytes come from a GLB binary chunk rather than a URI.
  uri?: string;
}
