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
  materials?: GltfMaterial[];
  textures?: GltfTexture[];
  images?: GltfImage[];
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  buffers?: GltfBuffer[];
  skins?: GltfSkin[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}

// A glTF material. Its metallic-roughness block and the normal/occlusion/emissive channels map onto
// Flight's StandardPbrMaterial — glTF's shading model IS metallic-roughness PBR, so it decodes to PBR
// (not the Blinn-Phong the classic formats decode to). Absent factors take the spec defaults.
export interface GltfMaterial {
  name?: string;
  pbrMetallicRoughness?: GltfPbrMetallicRoughness;
  normalTexture?: GltfNormalTextureInfo;
  occlusionTexture?: GltfOcclusionTextureInfo;
  emissiveTexture?: GltfTextureInfo;
  // Linear RGB in [0,1]; spec default [0,0,0].
  emissiveFactor?: number[];
  // 'OPAQUE' (default), 'MASK' (hard cut at alphaCutoff), or 'BLEND'.
  alphaMode?: 'BLEND' | 'MASK' | 'OPAQUE';
  // Mask-mode cutoff; spec default 0.5.
  alphaCutoff?: number;
  doubleSided?: boolean;
}

export interface GltfPbrMetallicRoughness {
  // sRGB-albedo RGBA in [0,1]; spec default [1,1,1,1].
  baseColorFactor?: number[];
  baseColorTexture?: GltfTextureInfo;
  // Spec default 1.
  metallicFactor?: number;
  // Spec default 1.
  roughnessFactor?: number;
  metallicRoughnessTexture?: GltfTextureInfo;
}

// A reference to a texture from a material channel. `index` points into `GltfDocument.textures`.
export interface GltfTextureInfo {
  index: number;
  texCoord?: number;
}

export interface GltfNormalTextureInfo extends GltfTextureInfo {
  // Scales the sampled normal's XY; spec default 1.
  scale?: number;
}

export interface GltfOcclusionTextureInfo extends GltfTextureInfo {
  // Scales the occlusion contribution; spec default 1.
  strength?: number;
}

// A texture binds an image `source` to a `sampler`. Flight consumes only the image today.
export interface GltfTexture {
  sampler?: number;
  source?: number;
}

// An image is backed by EITHER a `uri` (external file or `data:` URI) OR a `bufferView` (bytes inside
// a glTF/GLB buffer, with the MIME type declared in `mimeType`).
export interface GltfImage {
  uri?: string;
  mimeType?: string;
  bufferView?: number;
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
