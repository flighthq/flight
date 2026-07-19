// glTF 2.0 JSON wire-format schema — the subset @flighthq/scene-formats imports today: node hierarchy,
// mesh geometry, PBR materials, textures (sampler + KHR_texture_transform), skins, morph targets, and
// TRS/weights animation, over embedded base64, GLB-binary, or caller-supplied external buffers. Field
// names match the glTF 2.0 spec exactly. Indices into the document's parallel arrays are the spec's
// referencing model.
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
  samplers?: GltfSampler[];
  images?: GltfImage[];
  animations?: GltfAnimation[];
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  buffers?: GltfBuffer[];
  skins?: GltfSkin[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}

// A glTF animation: a bundle of channels, each pairing a sampler (the keyframe curve) with a target
// (which node's TRS component it drives). Maps to one Flight AnimationClip.
export interface GltfAnimation {
  name?: string;
  channels: GltfAnimationChannel[];
  samplers: GltfAnimationSampler[];
}

export interface GltfAnimationChannel {
  sampler: number;
  target: { node?: number; path: 'rotation' | 'scale' | 'translation' | 'weights' };
}

// A sampler's `input` accessor holds ascending keyframe times (SCALAR); `output` holds the values
// (VEC3 for translation/scale, VEC4 quaternion for rotation; 3× that count for CUBICSPLINE tangents).
export interface GltfAnimationSampler {
  input: number;
  output: number;
  interpolation?: 'CUBICSPLINE' | 'LINEAR' | 'STEP';
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
  // Linear-albedo RGBA in [0,1]; spec default [1,1,1,1]. (Per the glTF spec the factor is linear; the
  // baseColorTexture is sRGB-encoded, but the factor is not — the importer sRGB-encodes it when packing.)
  baseColorFactor?: number[];
  baseColorTexture?: GltfTextureInfo;
  // Spec default 1.
  metallicFactor?: number;
  // Spec default 1.
  roughnessFactor?: number;
  metallicRoughnessTexture?: GltfTextureInfo;
}

// A reference to a texture from a material channel. `index` points into `GltfDocument.textures`.
// `extensions.KHR_texture_transform` carries the offset/rotation/scale UV remap applied at sample
// time (the glTF-native tiling/atlas model, mapped onto the Texture's uvOffset/uvRotation/uvScale).
export interface GltfTextureInfo {
  index: number;
  texCoord?: number;
  extensions?: { KHR_texture_transform?: GltfTextureTransform };
}

// The KHR_texture_transform extension block: a 2D offset (spec default [0,0]), a rotation in radians
// (spec default 0, counter-clockwise about the origin), and a scale (spec default [1,1]), applied to
// the UVs before sampling. `texCoord` overrides the referencing textureInfo's UV set (unused today —
// Flight interleaves TEXCOORD_0 only).
export interface GltfTextureTransform {
  offset?: number[];
  rotation?: number;
  scale?: number[];
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

// A texture binds an image `source` to a `sampler`. The sampler (an index into `GltfDocument.samplers`)
// carries the wrap/filter state Flight maps onto a Sampler; absent means the spec-default sampler
// (repeat wrap, implementation-chosen filtering).
export interface GltfTexture {
  sampler?: number;
  source?: number;
}

// A glTF sampler: wrap modes and min/mag filters as GL enum constants. wrapS/wrapT map to the
// Texture's wrapU/wrapV; magFilter/minFilter to the Sampler's mag/min filters (the mip-aware min
// filters imply a mip chain). Absent fields take the spec defaults (repeat wrap; auto filtering).
export interface GltfSampler {
  magFilter?: 9728 | 9729;
  minFilter?: 9728 | 9729 | 9984 | 9985 | 9986 | 9987;
  wrapS?: 10497 | 33071 | 33648;
  wrapT?: 10497 | 33071 | 33648;
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
  // Default morph-target weights, one per entry in each primitive's `targets`. The mesh's initial
  // weight array; a `weights` animation channel overrides it at runtime.
  weights?: number[];
}

// One morph target's attribute deltas: POSITION always, NORMAL/TANGENT optionally. Each value is an
// accessor index into VEC3 (POSITION/NORMAL) or VEC3 (TANGENT — morph tangent deltas are 3-component,
// the handedness `w` is not morphed) delta data aligned index-for-index with the base attributes.
export interface GltfMorphTarget {
  NORMAL?: number;
  POSITION?: number;
  TANGENT?: number;
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
  // Morph targets: one entry per blend shape, each a set of POSITION/NORMAL/TANGENT delta accessors.
  targets?: GltfMorphTarget[];
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
  // Sparse storage: `count` elements at `indices` are overridden by `values`, on top of the base data
  // the `bufferView` provides (or a zero-filled base when `bufferView` is absent).
  sparse?: GltfAccessorSparse;
}

// The sparse block of an accessor. `indices` (an unsigned-integer accessor-less bufferView slice) lists
// which elements to override; `values` holds the replacement elements in the accessor's own type.
export interface GltfAccessorSparse {
  count: number;
  indices: { bufferView: number; byteOffset?: number; componentType: 5121 | 5123 | 5125 };
  values: { bufferView: number; byteOffset?: number };
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

// Options for resolving a glTF document's external references. Parsing is synchronous, so a glTF
// that stores its geometry in an external `.bin` (or images at external URIs) needs the caller to
// supply already-fetched bytes and/or a base directory:
//   externalBuffers — encoded bytes for external buffer/image URIs the parser must read now (geometry
//                     lives here), keyed by the exact `uri` string as it appears in the document.
//                     A buffer URI missing from this map decodes to empty with a warning.
//   basePath        — the directory the container was loaded from, carried onto every External image
//                     ref so @flighthq/scene-resources resolves a relative image URI against it later.
// Both are optional: an all-embedded (data-URI or GLB-binary) document needs neither. This is the
// only public input beyond the document itself, so it stays a plain-data object (no fetch callback —
// the async fetch is the resolver's job, not the parser's).
export interface GltfImportOptions {
  basePath?: string | null;
  externalBuffers?: Readonly<Record<string, ArrayLike<number>>>;
}
