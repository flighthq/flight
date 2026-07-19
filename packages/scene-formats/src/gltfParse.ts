import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation';
import { packLinearToColor } from '@flighthq/color';
import { setQuaternion, setVector3 } from '@flighthq/geometry';
import { detectImageMimeType } from '@flighthq/image-codec';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild, getNodeChildren, invalidateNodeLocalTransform, setNodeLocalMatrix4 } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene, createSceneNode, isMesh } from '@flighthq/scene';
import { createSkeleton3D } from '@flighthq/skeleton3d';
import type {
  AnimationChannel,
  AnimationClip,
  AnimationInterpolation,
  Material,
  Mesh,
  MeshGeometry,
  MeshMorph,
  MorphTarget,
  SceneAnimationPath,
  SceneNode,
  Skin,
  Texture,
  TextureColorSpace,
  TextureFilter,
  TextureWrap,
} from '@flighthq/types';
import {
  SceneAnimationPathRotation,
  SceneAnimationPathScale,
  SceneAnimationPathTranslation,
  SceneAnimationPathWeights,
} from '@flighthq/types';

import type {
  GltfAccessor,
  GltfAnimation,
  GltfBuffer,
  GltfComponentType,
  GltfDocument,
  GltfImage,
  GltfImportOptions,
  GltfMaterial,
  GltfMorphTarget,
  GltfNode,
  GltfPrimitive,
  GltfSampler,
  GltfTextureInfo,
} from './gltfSchema';
import type { SceneImport } from './sceneImport';

// Parses a binary glTF (`.glb`) container into a Scene. The 12-byte header (magic `glTF`, version,
// length) is validated, then the chunk stream is walked to extract the embedded JSON document and the
// optional BIN chunk; the BIN chunk backs any buffer that has no `uri`. `options` supplies external
// buffer bytes and a base path for any external URIs the GLB still references. Malformed containers
// return an empty Scene and push a warning rather than throwing.
export function createSceneFromGlb(
  bytes: Readonly<Uint8Array>,
  warnings?: string[],
  options?: Readonly<GltfImportOptions>,
): Scene {
  const container = readGlbContainer(bytes, warnings);
  if (container === null) return createScene();
  return buildSceneFromGltfDocument(container.document, container.binary, options, warnings);
}

// Parses a glTF 2.0 document (JSON string or already-parsed object) into a Scene: the node hierarchy
// with transforms, plus Mesh nodes whose geometry is read from embedded (base64 data-URI) buffers. A
// malformed JSON string returns an empty Scene and pushes a warning rather than throwing.
//
// Imported today: POSITION + optional NORMAL / TANGENT / TEXCOORD_0 + indices, interleaved into the
// canonical PBR vertex layout (or the skinned layout when JOINTS_0/WEIGHTS_0 are present); skins
// (joint hierarchy + inverse-bind matrices bound to the mesh via `mesh.skin`); every `primitives[]`
// entry of a mesh (multi-primitive → sub-mesh children); strided (`byteStride`) and normalized-integer
// accessors; sparse accessors; materials (metallic-roughness PBR → StandardPbrMaterial); textures with
// their sampler (wrap/filter), color space (srgb for baseColor/emissive, linear for data maps), and
// KHR_texture_transform UV remap, resolving embedded bytes to Embedded refs and external URIs to
// External refs (against `options.basePath`); external (`.bin`) buffers via `options.externalBuffers`.
export function createSceneFromGltf(
  source: GltfDocument | string,
  warnings?: string[],
  options?: Readonly<GltfImportOptions>,
): Scene {
  let doc: GltfDocument;
  if (typeof source === 'string') {
    try {
      doc = JSON.parse(source) as GltfDocument;
    } catch {
      warnings?.push('createSceneFromGltf: source is not valid JSON; returning empty scene');
      return createScene();
    }
  } else {
    doc = source;
  }
  return buildSceneFromGltfDocument(doc, null, options, warnings);
}

// Imports a binary glTF (`.glb`) container as a whole file: every scene plus every animation clip,
// with clip channels bound to the same SceneNode instances the scenes hold. `options` supplies any
// external buffer bytes and base path the container still references. The assembly-tier sibling of
// createSceneFromGlb — reach for it when the file carries animations or multiple scenes.
export function importGlb(
  bytes: Readonly<Uint8Array>,
  warnings?: string[],
  options?: Readonly<GltfImportOptions>,
): SceneImport {
  const container = readGlbContainer(bytes, warnings);
  if (container === null) return emptySceneImport();
  return importGltfDocument(container.document, container.binary, options, warnings);
}

// Imports a glTF 2.0 document as a whole file: `{ scene, scenes, animations }`. `scene` is the default
// scene (`doc.scene`), `scenes` every scene the file declares (all sharing one node pool), and
// `animations` a clip per `animations[]` entry with channels bound to the built nodes. `options`
// supplies external buffer bytes and a base path for external URIs. The assembly-tier sibling of
// createSceneFromGltf; the geometry-only primitive stays separate so a scene-only caller tree-shakes
// the animation code out.
export function importGltf(
  source: GltfDocument | string,
  warnings?: string[],
  options?: Readonly<GltfImportOptions>,
): SceneImport {
  let doc: GltfDocument;
  if (typeof source === 'string') {
    try {
      doc = JSON.parse(source) as GltfDocument;
    } catch {
      warnings?.push('importGltf: source is not valid JSON; returning empty import');
      return emptySceneImport();
    }
  } else {
    doc = source;
  }
  return importGltfDocument(doc, null, options, warnings);
}

function applyNodeTransform(node: SceneNode, gltfNode: Readonly<GltfNode>): void {
  if (gltfNode.matrix !== undefined) {
    // glTF node matrix is column-major 16-float; author it directly (leaves the node detached).
    setNodeLocalMatrix4(node, { m: new Float32Array(gltfNode.matrix) });
    return;
  }
  const t = gltfNode.translation;
  const r = gltfNode.rotation;
  const s = gltfNode.scale;
  if (t === undefined && r === undefined && s === undefined) return;
  setVector3(node.position, t?.[0] ?? 0, t?.[1] ?? 0, t?.[2] ?? 0);
  setQuaternion(node.rotation, r?.[0] ?? 0, r?.[1] ?? 0, r?.[2] ?? 0, r?.[3] ?? 1);
  setVector3(node.scale, s?.[0] ?? 1, s?.[1] ?? 1, s?.[2] ?? 1);
  invalidateNodeLocalTransform(node);
}

// Builds the default scene from a parsed document plus an optional GLB binary chunk (null for the JSON
// path). This is the geometry-only primitive's core: it deliberately never references the animation
// builder, so a caller using only createSceneFrom* tree-shakes the animation code out of its bundle.
function buildSceneFromGltfDocument(
  doc: Readonly<GltfDocument>,
  binary: Readonly<Uint8Array> | null,
  options: Readonly<GltfImportOptions> | undefined,
  warnings?: string[],
): Scene {
  const pool = buildGltfNodePool(doc, binary, options, warnings);
  if (pool === null) return createScene();
  return assembleGltfScene(doc, pool.sceneNodes, doc.scene ?? 0);
}

// The document's shared node pool: every `nodes[]` entry built into a SceneNode (with geometry,
// materials, transform, hierarchy, and skins applied), plus the decoded buffers the animation reader
// needs. Every glTF scene is a view of root indices into this one pool, and animation channels target
// its nodes by index — so both the scene assembly and the animation binding read from here, and node
// identity never leaves the importer. Returns null when the document is not a usable object.
function buildGltfNodePool(
  doc: Readonly<GltfDocument>,
  binary: Readonly<Uint8Array> | null,
  options: Readonly<GltfImportOptions> | undefined,
  warnings?: string[],
): { buffers: readonly Uint8Array[]; sceneNodes: SceneNode[] } | null {
  if (doc === null || typeof doc !== 'object') {
    warnings?.push('createSceneFromGltf: document is not an object; returning empty scene');
    return null;
  }
  const version = doc.asset?.version;
  if (version === undefined || !isSupportedGltfVersion(version)) {
    warnings?.push(`createSceneFromGltf: unsupported glTF asset.version '${version ?? '(missing)'}' (expected 2.x)`);
  }
  if (doc.extensionsRequired !== undefined) {
    for (const extension of doc.extensionsRequired) {
      warnings?.push(`createSceneFromGltf: required extension '${extension}' is not supported and was ignored`);
    }
  }

  const buffers = (doc.buffers ?? []).map((buffer) => decodeGltfBuffer(buffer, binary, options, warnings));
  // Each mesh maps to the list of geometries built from its primitives (one geometry per primitive).
  const meshGeometries = (doc.meshes ?? []).map((mesh) =>
    mesh.primitives.map((primitive) => primitiveToGeometry(doc, buffers, primitive, warnings)),
  );
  // Each mesh maps to the per-primitive morph (targets + initial weights), or null when a primitive
  // carries no `targets`. Parallel to meshGeometries so buildMeshSceneNode attaches the matching morph.
  const meshMorphs = (doc.meshes ?? []).map((mesh) =>
    mesh.primitives.map((primitive) => buildGltfMorph(doc, buffers, primitive, mesh.weights, warnings)),
  );

  // Resolve each glTF material to a StandardPbrMaterial once (memoized by index), then map each mesh's
  // primitives to the material each references. glTF's shading model is metallic-roughness PBR, so it
  // decodes to StandardPbrMaterial rather than the Blinn-Phong the classic formats use.
  const resolvedMaterials = (doc.materials ?? []).map((material) => gltfMaterialToPbr(doc, buffers, material, options));
  const meshMaterials = (doc.meshes ?? []).map((mesh) =>
    mesh.primitives.map((primitive) =>
      primitive.material !== undefined ? (resolvedMaterials[primitive.material] ?? null) : null,
    ),
  );

  const gltfNodes = doc.nodes ?? [];
  const sceneNodes: SceneNode[] = gltfNodes.map((node) =>
    node.mesh !== undefined
      ? buildMeshSceneNode(meshGeometries[node.mesh], meshMaterials[node.mesh], meshMorphs[node.mesh])
      : createSceneNode(),
  );

  for (let i = 0; i < gltfNodes.length; i++) {
    applyNodeTransform(sceneNodes[i], gltfNodes[i]);
    const children = gltfNodes[i].children;
    if (children !== undefined) {
      for (let c = 0; c < children.length; c++) addNodeChild(sceneNodes[i], sceneNodes[children[c]]);
    }
  }

  // Skin pass: a node carrying both `mesh` and `skin` instances a skinned mesh. Run it after every
  // node exists (and its transform is applied) so the skin's joint references resolve to the built,
  // rest-posed SceneNodes and their inverse-bind capture is correct.
  for (let i = 0; i < gltfNodes.length; i++) {
    const skinIndex = gltfNodes[i].skin;
    if (skinIndex === undefined || gltfNodes[i].mesh === undefined) continue;
    const skin = buildGltfSkin(doc, buffers, skinIndex, sceneNodes, warnings);
    if (skin !== null) applySkinToMeshNodes(sceneNodes[i], skin);
  }

  return { buffers, sceneNodes };
}

// Assembles one glTF scene (by index into `scenes[]`) into a Flight Scene, parenting the built nodes
// for that scene's roots. Falls back to the document's top-level nodes when `scenes` is absent.
function assembleGltfScene(doc: Readonly<GltfDocument>, sceneNodes: readonly SceneNode[], sceneIndex: number): Scene {
  const scene = createScene();
  const roots = doc.scenes?.[sceneIndex]?.nodes ?? topLevelNodeIndices(doc.nodes ?? []);
  for (let r = 0; r < roots.length; r++) {
    const node = sceneNodes[roots[r]];
    if (node !== undefined) addNodeChild(scene, node);
  }
  return scene;
}

// Shared whole-file import for both the JSON and GLB entry points: builds the node pool once, then
// every scene (as a view of that pool) and every animation clip (bound to that pool's nodes).
function importGltfDocument(
  doc: Readonly<GltfDocument>,
  binary: Readonly<Uint8Array> | null,
  options: Readonly<GltfImportOptions> | undefined,
  warnings?: string[],
): SceneImport {
  const pool = buildGltfNodePool(doc, binary, options, warnings);
  if (pool === null) return emptySceneImport();

  const sceneCount = doc.scenes?.length ?? 0;
  const scenes: Scene[] = [];
  for (let i = 0; i < sceneCount; i++) scenes.push(assembleGltfScene(doc, pool.sceneNodes, i));
  const defaultIndex = doc.scene ?? 0;
  // With no `scenes[]` at all, still surface the top-level-node fallback scene as the primary.
  const scene = scenes[defaultIndex] ?? assembleGltfScene(doc, pool.sceneNodes, defaultIndex);
  if (scenes.length === 0) scenes.push(scene);

  const animations = (doc.animations ?? [])
    .map((animation) => buildGltfAnimationClip(doc, pool.buffers, pool.sceneNodes, animation, warnings))
    .filter((clip): clip is AnimationClip => clip !== null);

  return { animations, scene, scenes };
}

// Builds one AnimationClip from a glTF animation: each channel becomes an AnimationChannel whose track
// samples the channel's sampler (keyframe times + values) and whose targetRef binds the driven node and
// its path. Rotation is a quaternion track (slerped on Linear); CUBICSPLINE maps to the Cubic
// interpolation the AnimationTrack already models (in-tangent, value, out-tangent per key). A 'weights'
// (morph-target) channel binds to the target Mesh node's morph weight array — its track width is the
// mesh's morph-target count, read off the built mesh's MeshMorph — closing the double gap where the
// importer previously dropped morph. Returns null when the animation yields no bindable channel.
function buildGltfAnimationClip(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  sceneNodes: readonly SceneNode[],
  animation: Readonly<GltfAnimation>,
  warnings?: string[],
): AnimationClip | null {
  const channels: AnimationChannel[] = [];
  for (const channel of animation.channels) {
    const targetNodeIndex = channel.target.node;
    const node = targetNodeIndex !== undefined ? sceneNodes[targetNodeIndex] : undefined;
    if (node === undefined) continue;

    const sampler = animation.samplers[channel.sampler];
    if (sampler === undefined) {
      warnings?.push(`buildGltfAnimationClip: channel references missing sampler ${channel.sampler}`);
      continue;
    }
    const times = readAccessor(doc, buffers, sampler.input, warnings).data;
    const values = readAccessor(doc, buffers, sampler.output, warnings).data;

    if (channel.target.path === 'weights') {
      appendGltfWeightsChannels(channels, node, times, values, sampler.interpolation, warnings);
      continue;
    }

    const path = GLTF_ANIMATION_PATHS[channel.target.path];
    if (path === undefined) {
      warnings?.push(`buildGltfAnimationClip: unsupported animation target path '${channel.target.path}'`);
      continue;
    }
    const quaternion = path === SceneAnimationPathRotation;
    const track = createAnimationTrack({
      components: quaternion ? 4 : 3,
      interpolation: GLTF_SAMPLER_INTERPOLATIONS[sampler.interpolation ?? 'LINEAR'],
      quaternion,
      times,
      values,
    });
    channels.push(createAnimationChannel(track, { node, path }));
  }
  return channels.length > 0 ? createAnimationClip(channels) : null;
}

// Appends a Weights morph channel for each Mesh under a glTF animation-target node. A single-primitive
// mesh is itself the Mesh; a multi-primitive mesh is a group of child Meshes that share one glTF morph
// (glTF weights are per-mesh, applied to every primitive), so each child gets its own channel bound to
// its own morph weight array. The track's component width is the mesh's morph-target count, so the
// per-keyframe value block (targetCount weights) samples straight into morph.weights. A node with no
// morphable Mesh yields no channel (the morph channel is silently dropped).
function appendGltfWeightsChannels(
  channels: AnimationChannel[],
  node: Readonly<SceneNode>,
  times: ArrayLike<number>,
  values: ArrayLike<number>,
  interpolation: string | undefined,
  warnings?: string[],
): void {
  const meshes = isMesh(node) ? [node as unknown as Mesh] : collectMorphableChildMeshes(node);
  let bound = 0;
  for (let i = 0; i < meshes.length; i++) {
    const morph = meshes[i].morph;
    if (morph == null || morph.targets.length === 0) continue;
    const track = createAnimationTrack({
      components: morph.targets.length,
      interpolation: GLTF_SAMPLER_INTERPOLATIONS[interpolation ?? 'LINEAR'],
      times,
      values,
    });
    channels.push(createAnimationChannel(track, { node: meshes[i], path: SceneAnimationPathWeights }));
    bound++;
  }
  if (bound === 0) {
    warnings?.push('buildGltfAnimationClip: weights channel targets a node with no morphable mesh; skipped');
  }
}

// The morphable Mesh children of a multi-primitive mesh group (each primitive is a child Mesh). Used to
// fan a per-mesh glTF weights channel out to every primitive's own morph weight array.
function collectMorphableChildMeshes(node: Readonly<SceneNode>): Mesh[] {
  const out: Mesh[] = [];
  const children = getNodeChildren(node);
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as unknown as SceneNode;
    if (isMesh(child)) out.push(child as unknown as Mesh);
  }
  return out;
}

function emptySceneImport(): SceneImport {
  const scene = createScene();
  return { animations: [], scene, scenes: [scene] };
}

// Attaches a skin to the Mesh node(s) a glTF node produced: directly when the node is itself a Mesh
// (single-primitive), or to each Mesh child when it is the transform-only group of a multi-primitive
// mesh. The skin object is shared across a multi-primitive mesh's parts — they share one skeleton.
function applySkinToMeshNodes(node: SceneNode, skin: Readonly<Skin>): void {
  if (isMesh(node)) {
    (node as Mesh).skin = skin;
    return;
  }
  const children = getNodeChildren(node);
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as unknown as SceneNode;
    if (isMesh(child)) (child as unknown as Mesh).skin = skin;
  }
}

// Builds a Skin from a glTF `skins[]` entry: resolves the joint node indices to the constructed
// SceneNodes, reads the inverse-bind matrices accessor (one column-major MAT4 per joint; identity per
// the spec when absent), and carries the joint names + optional skeleton-root node. Returns null when
// the skin index is out of range.
function buildGltfSkin(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  skinIndex: number,
  sceneNodes: readonly SceneNode[],
  warnings?: string[],
): Skin | null {
  const gltfSkin = doc.skins?.[skinIndex];
  if (gltfSkin === undefined) {
    warnings?.push(`buildGltfSkin: skin ${skinIndex} not found in document`);
    return null;
  }

  const joints: SceneNode[] = [];
  const names: string[] = [];
  for (let j = 0; j < gltfSkin.joints.length; j++) {
    const jointNodeIndex = gltfSkin.joints[j];
    const node = sceneNodes[jointNodeIndex];
    if (node === undefined) {
      warnings?.push(`buildGltfSkin: skin ${skinIndex} joint references missing node ${jointNodeIndex}`);
      continue;
    }
    joints.push(node);
    names.push(doc.nodes?.[jointNodeIndex]?.name ?? '');
  }

  const jointCount = joints.length;
  let inverseBindMatrices: Float32Array;
  if (gltfSkin.inverseBindMatrices !== undefined) {
    inverseBindMatrices = Float32Array.from(readAccessor(doc, buffers, gltfSkin.inverseBindMatrices, warnings).data);
  } else {
    // Spec default: identity per joint (the joints are authored pre-transformed).
    inverseBindMatrices = new Float32Array(jointCount * 16);
    for (let j = 0; j < jointCount; j++) {
      const base = j * 16;
      inverseBindMatrices[base] = 1;
      inverseBindMatrices[base + 5] = 1;
      inverseBindMatrices[base + 10] = 1;
      inverseBindMatrices[base + 15] = 1;
    }
  }

  const hasNames = names.some((name) => name.length > 0);
  const skeleton = createSkeleton3D(joints, inverseBindMatrices, hasNames ? names : null);
  const skeletonRoot = gltfSkin.skeleton !== undefined ? (sceneNodes[gltfSkin.skeleton] ?? null) : null;
  return { skeleton, skeletonRoot };
}

// Turns a mesh's per-primitive geometries into a scene node. A single-primitive mesh becomes the Mesh
// node directly; a multi-primitive mesh becomes a transform-only group with one child Mesh per
// primitive (each an independent drawable, so multi-material meshes keep every subset). Each primitive
// carries the StandardPbrMaterial it references (empty when the primitive names no material) and its
// morph target set (null when the primitive has no `targets`).
function buildMeshSceneNode(
  geometries: readonly MeshGeometry[] | undefined,
  materials: readonly (Material | null)[] | undefined,
  morphs: readonly (MeshMorph | null)[] | undefined,
): SceneNode {
  if (geometries === undefined || geometries.length === 0) return createSceneNode();
  const materialsFor = (i: number): Material[] => {
    const material = materials?.[i] ?? null;
    return material !== null ? [material] : [];
  };
  const buildMesh = (i: number): Mesh => {
    const mesh = createMesh(geometries[i], materialsFor(i));
    const morph = morphs?.[i] ?? null;
    if (morph !== null) mesh.morph = morph;
    return mesh;
  };
  if (geometries.length === 1) return buildMesh(0) as unknown as SceneNode;
  const group = createSceneNode();
  for (let i = 0; i < geometries.length; i++) addNodeChild(group, buildMesh(i) as unknown as SceneNode);
  return group;
}

// Converts a glTF material to Flight's StandardPbrMaterial — glTF's own metallic-roughness model. The
// pbrMetallicRoughness factors/textures, the normal/occlusion/emissive channels, and the alpha mode
// map field-for-field; absent factors take the spec defaults. Textures resolve to Unresolved refs
// carrying their sampler, color space, and KHR_texture_transform (the parser references, it does not
// decode). baseColor/emissive maps are sampled in 'srgb'; the data maps (normal/metallic-roughness/
// occlusion) in 'linear', so a shader does not gamma-decode data channels. glTF's baseColorFactor and
// emissiveFactor are LINEAR, but StandardPbrMaterial.baseColor/emissive are packed sRGB (scene-gl
// gamma-decodes them via unpackColorToLinear), so the linear factor is sRGB-encoded with
// packLinearToColor before packing — the documented inverse of that decode. This is the faithful
// decode: glTF is natively PBR, so unlike the classic formats it is NOT reinterpreted.
function gltfMaterialToPbr(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  material: Readonly<GltfMaterial>,
  options: Readonly<GltfImportOptions> | undefined,
): Material {
  const pbr = material.pbrMetallicRoughness ?? {};
  const result = createStandardPbrMaterial({
    baseColor: packGltfLinearColor(pbr.baseColorFactor ?? [1, 1, 1, 1], 4),
    baseColorMap: resolveGltfTexture(doc, buffers, pbr.baseColorTexture, 'srgb', options),
    emissive: packGltfLinearColor(material.emissiveFactor ?? [0, 0, 0], 3),
    emissiveMap: resolveGltfTexture(doc, buffers, material.emissiveTexture, 'srgb', options),
    metallic: pbr.metallicFactor ?? 1,
    metallicRoughnessMap: resolveGltfTexture(doc, buffers, pbr.metallicRoughnessTexture, 'linear', options),
    normalMap: resolveGltfTexture(doc, buffers, material.normalTexture, 'linear', options),
    normalScale: material.normalTexture?.scale ?? 1,
    occlusionMap: resolveGltfTexture(doc, buffers, material.occlusionTexture, 'linear', options),
    occlusionStrength: material.occlusionTexture?.strength ?? 1,
    roughness: pbr.roughnessFactor ?? 1,
  });
  result.alphaMode = material.alphaMode === 'MASK' ? 'mask' : material.alphaMode === 'BLEND' ? 'blend' : 'opaque';
  result.alphaCutoff = material.alphaCutoff ?? 0.5;
  result.doubleSided = material.doubleSided ?? false;
  result.name = material.name ?? null;
  return result as unknown as Material;
}

// Resolves a glTF material texture reference to a Flight Texture carrying an Unresolved resource ref
// plus its sampled state: a `data:` URI or bufferView-embedded image becomes an Embedded ref (bytes in
// hand), an external URI becomes an External ref against `options.basePath`. The referenced glTF
// `sampler` (wrap/filter) maps onto the Texture's Sampler + wrap; `colorSpace` sets whether the shader
// gamma-decodes it (srgb for color maps, linear for data maps); a KHR_texture_transform on the
// textureInfo sets the Texture's uvOffset/uvRotation/uvScale. Returns null when the reference or its
// image cannot be resolved.
function resolveGltfTexture(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  info: Readonly<GltfTextureInfo> | undefined,
  colorSpace: TextureColorSpace,
  options: Readonly<GltfImportOptions> | undefined,
): Texture | null {
  if (info === undefined) return null;
  const texture = doc.textures?.[info.index];
  if (texture?.source === undefined) return null;
  const image = doc.images?.[texture.source];
  if (image === undefined) return null;
  const result = gltfImageToTexture(doc, buffers, image, options);
  if (result === null) return null;

  result.colorSpace = colorSpace;
  applyGltfSampler(result, texture.sampler !== undefined ? doc.samplers?.[texture.sampler] : undefined);
  applyGltfTextureTransform(result, info.extensions?.KHR_texture_transform);
  return result;
}

// Maps a glTF sampler's GL wrap/filter enums onto the Texture's Sampler and wrap fields. Absent
// samplers/fields take the Flight sampler defaults (createTexture already supplied them). Mip-aware
// glTF min filters imply a generated mip chain (Sampler.mipmaps = true); the non-mip nearest/linear
// filters imply none. Anisotropy is not a glTF concept, so it stays at the default.
function applyGltfSampler(texture: Texture, sampler: Readonly<GltfSampler> | undefined): void {
  if (sampler === undefined) return;
  if (sampler.wrapS !== undefined) texture.sampler.wrapU = GLTF_TEXTURE_WRAP[sampler.wrapS];
  if (sampler.wrapT !== undefined) texture.sampler.wrapV = GLTF_TEXTURE_WRAP[sampler.wrapT];
  if (sampler.magFilter !== undefined) texture.sampler.magFilter = GLTF_TEXTURE_FILTER[sampler.magFilter];
  if (sampler.minFilter !== undefined) {
    texture.sampler.minFilter = GLTF_TEXTURE_FILTER[sampler.minFilter];
    texture.sampler.mipmaps = GLTF_MIN_FILTER_MIPMAPS[sampler.minFilter];
  }
}

// Applies a KHR_texture_transform block to the Texture's KHR_texture_transform fields (the identity is
// already in place from createTexture). offset → uvOffset, rotation (radians) → uvRotation, scale →
// uvScale. Absent sub-fields take the extension's spec defaults ([0,0] / 0 / [1,1]).
function applyGltfTextureTransform(
  texture: Texture,
  transform: NonNullable<GltfTextureInfo['extensions']>['KHR_texture_transform'] | undefined,
): void {
  if (transform === undefined) return;
  texture.uvOffset.x = transform.offset?.[0] ?? 0;
  texture.uvOffset.y = transform.offset?.[1] ?? 0;
  texture.uvRotation = transform.rotation ?? 0;
  texture.uvScale.x = transform.scale?.[0] ?? 1;
  texture.uvScale.y = transform.scale?.[1] ?? 1;
}

// Builds a Texture from a glTF image: a `data:` URI decodes its base64 payload to an Embedded ref
// (MIME from the URI header, the declared `mimeType`, or sniffed from the bytes); an external URI
// becomes an External ref against `options.basePath`; a bufferView slices the encoded bytes out of its
// buffer as an Embedded ref.
function gltfImageToTexture(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  image: Readonly<GltfImage>,
  options: Readonly<GltfImportOptions> | undefined,
): Texture | null {
  if (image.uri !== undefined) {
    if (image.uri.startsWith('data:')) {
      const comma = image.uri.indexOf(',');
      if (comma < 0) return null;
      const semicolon = image.uri.indexOf(';');
      const declared = semicolon > 5 ? image.uri.slice(5, semicolon) : (image.mimeType ?? null);
      const bytes = decodeBase64(image.uri.slice(comma + 1));
      return createEmbeddedTextureRef(bytes, declared ?? detectImageMimeType(bytes));
    }
    return createExternalTextureRef(image.uri, options?.basePath ?? null);
  }
  if (image.bufferView !== undefined) {
    const bufferView = doc.bufferViews?.[image.bufferView];
    const buffer = bufferView !== undefined ? buffers[bufferView.buffer] : undefined;
    if (bufferView === undefined || buffer === undefined) return null;
    const start = bufferView.byteOffset ?? 0;
    const bytes = buffer.slice(start, start + bufferView.byteLength);
    return createEmbeddedTextureRef(bytes, image.mimeType ?? detectImageMimeType(bytes));
  }
  return null;
}

// Packs the first `channels` of a glTF LINEAR-space color factor (each in [0,1]) into a 0xRRGGBBAA
// integer, sRGB-encoding the RGB channels so scene-gl's unpackColorToLinear gamma-decode recovers the
// authored linear value (packLinearToColor is the documented inverse of that decode). With 3 channels
// alpha is forced opaque; with 4 the 4th is the (linear coverage) alpha, passed through unencoded.
function packGltfLinearColor(factor: readonly number[], channels: number): number {
  const a = channels === 4 ? (factor[3] ?? 0) : 1;
  return packLinearToColor([factor[0] ?? 0, factor[1] ?? 0, factor[2] ?? 0, a]);
}

// Decodes a buffer into bytes. A `data:` URI base64-decodes; a buffer with no `uri` is backed by the
// GLB binary chunk when present. An external (`.bin`) URI is served from `options.externalBuffers`
// (the caller fetched it, since parse is synchronous), keyed by the exact `uri` string. A URI missing
// from that map, or a uri-less buffer with no binary chunk, decodes to empty with a warning.
function decodeGltfBuffer(
  buffer: Readonly<GltfBuffer>,
  binary: Readonly<Uint8Array> | null,
  options: Readonly<GltfImportOptions> | undefined,
  warnings?: string[],
): Uint8Array {
  const uri = buffer.uri;
  if (uri === undefined) {
    if (binary !== null) return binary as Uint8Array;
    warnings?.push('decodeGltfBuffer: buffer has no uri and no GLB binary chunk; returning empty buffer');
    return new Uint8Array(0);
  }
  const comma = uri.indexOf(',');
  if (uri.startsWith('data:') && comma >= 0) {
    return decodeBase64(uri.slice(comma + 1));
  }
  const supplied = options?.externalBuffers?.[uri];
  if (supplied !== undefined) return Uint8Array.from(supplied);
  warnings?.push(
    `decodeGltfBuffer: external buffer '${uri}' was not supplied via options.externalBuffers; returning empty buffer`,
  );
  return new Uint8Array(0);
}

// Portable base64 decode that works in Node.js (Vitest) and browsers alike, avoiding the
// browser-only atob() global.
function decodeBase64(s: string): Uint8Array {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const stripped = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  for (let i = 0; i < stripped.length; i += 4) {
    // A trailing quantum shorter than 4 chars encodes 1 or 2 bytes; the absent sextets contribute
    // zero to the value and their bytes are not emitted. (`indexOf` must not feed -1 into the bit
    // math, or it poisons the high byte — the reason padding is stripped and length-checked here.)
    const c0 = table.indexOf(stripped[i]);
    const c1 = table.indexOf(stripped[i + 1]);
    const c2 = i + 2 < stripped.length ? table.indexOf(stripped[i + 2]) : -1;
    const c3 = i + 3 < stripped.length ? table.indexOf(stripped[i + 3]) : -1;
    const n = (c0 << 18) | (c1 << 12) | ((c2 < 0 ? 0 : c2) << 6) | (c3 < 0 ? 0 : c3);
    out.push((n >> 16) & 0xff);
    if (c2 >= 0) out.push((n >> 8) & 0xff);
    if (c3 >= 0) out.push(n & 0xff);
  }
  return new Uint8Array(out);
}

function isSupportedGltfVersion(version: string): boolean {
  return Number.parseInt(version, 10) === 2;
}

// Normalizes a raw integer component to its float range per the glTF spec: unsigned types map onto
// [0, 1] by dividing by their max; signed types map onto [-1, 1] via max(c / MAX, -1). Float
// components pass through unchanged.
function normalizeComponent(componentType: GltfComponentType, value: number): number {
  switch (componentType) {
    case 5120:
      return Math.max(value / 127, -1);
    case 5121:
      return value / 255;
    case 5122:
      return Math.max(value / 32767, -1);
    case 5123:
      return value / 65535;
    case 5125:
      return value / 4294967295;
    default:
      return value;
  }
}

function primitiveToGeometry(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  primitive: Readonly<GltfPrimitive>,
  warnings?: string[],
): MeshGeometry {
  if (primitive.mode !== undefined && primitive.mode !== 4) {
    warnings?.push(
      `primitiveToGeometry: primitive mode ${primitive.mode} is not triangles (4); geometry imported as-is`,
    );
  }
  const positionIndex = primitive.attributes.POSITION;
  if (positionIndex === undefined) {
    warnings?.push('primitiveToGeometry: primitive has no POSITION attribute; returning empty geometry');
    return createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: new Float32Array(0) });
  }
  const position = readAccessor(doc, buffers, positionIndex, warnings);
  const vertexCount = position.count;
  const normal =
    primitive.attributes.NORMAL !== undefined
      ? readAccessor(doc, buffers, primitive.attributes.NORMAL, warnings)
      : null;
  const tangent =
    primitive.attributes.TANGENT !== undefined
      ? readAccessor(doc, buffers, primitive.attributes.TANGENT, warnings)
      : null;
  const uv =
    primitive.attributes.TEXCOORD_0 !== undefined
      ? readAccessor(doc, buffers, primitive.attributes.TEXCOORD_0, warnings)
      : null;

  // A primitive is skinned when it carries both influence channels; it then emits the skinned layout
  // (joints0/weights0 past uv0). JOINTS_0 is unsigned-integer indices (not normalized); WEIGHTS_0 is
  // float or normalized-integer weights, renormalized per vertex so any quantization drift still sums 1.
  const joints =
    primitive.attributes.JOINTS_0 !== undefined
      ? readAccessor(doc, buffers, primitive.attributes.JOINTS_0, warnings)
      : null;
  const weights =
    primitive.attributes.WEIGHTS_0 !== undefined
      ? readAccessor(doc, buffers, primitive.attributes.WEIGHTS_0, warnings)
      : null;
  const skinned = joints !== null && weights !== null;

  const floatsPerVertex = skinned ? SKINNED_FLOATS_PER_VERTEX : CANONICAL_FLOATS_PER_VERTEX;
  const vertices = new Float32Array(vertexCount * floatsPerVertex);
  for (let v = 0; v < vertexCount; v++) {
    const o = v * floatsPerVertex;
    vertices[o] = position.data[v * 3];
    vertices[o + 1] = position.data[v * 3 + 1];
    vertices[o + 2] = position.data[v * 3 + 2];
    if (normal !== null) {
      vertices[o + 3] = normal.data[v * 3];
      vertices[o + 4] = normal.data[v * 3 + 1];
      vertices[o + 5] = normal.data[v * 3 + 2];
    }
    if (tangent !== null) {
      vertices[o + 6] = tangent.data[v * 4];
      vertices[o + 7] = tangent.data[v * 4 + 1];
      vertices[o + 8] = tangent.data[v * 4 + 2];
      vertices[o + 9] = tangent.data[v * 4 + 3];
    }
    if (uv !== null) {
      vertices[o + 10] = uv.data[v * 2];
      vertices[o + 11] = uv.data[v * 2 + 1];
    }
    if (skinned) {
      vertices[o + 12] = joints.data[v * 4];
      vertices[o + 13] = joints.data[v * 4 + 1];
      vertices[o + 14] = joints.data[v * 4 + 2];
      vertices[o + 15] = joints.data[v * 4 + 3];
      const w0 = weights.data[v * 4];
      const w1 = weights.data[v * 4 + 1];
      const w2 = weights.data[v * 4 + 2];
      const w3 = weights.data[v * 4 + 3];
      const sum = w0 + w1 + w2 + w3;
      const inv = sum > 0 ? 1 / sum : 0;
      vertices[o + 16] = w0 * inv;
      vertices[o + 17] = w1 * inv;
      vertices[o + 18] = w2 * inv;
      vertices[o + 19] = w3 * inv;
    }
  }

  // glTF index accessors are ubyte/ushort/uint; normalize to Uint32Array (createMeshGeometry promotes/
  // accepts 16- or 32-bit index buffers).
  const indices =
    primitive.indices !== undefined
      ? Uint32Array.from(readAccessor(doc, buffers, primitive.indices, warnings).data)
      : undefined;
  return createMeshGeometry({
    indices,
    layout: skinned ? CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT : CANONICAL_LAYOUT,
    vertices,
  });
}

// Builds a MeshMorph from a primitive's `targets` (blend shapes), or null when the primitive carries
// none. Each target's POSITION delta accessor (always present) plus optional NORMAL/TANGENT delta
// accessors are read into de-interleaved Float32Array delta buffers aligned with the base vertices —
// the SoA shape blendMeshGeometryMorph consumes. glTF morph tangent deltas are VEC3 (the handedness
// `w` is not morphed), so the tangent delta is copied as 3 floats per vertex. `weights` seeds the live
// weight array from the mesh's default weights (spec: mesh.weights), zero-filled when absent; a
// `weights` animation channel overrides it at runtime.
function buildGltfMorph(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  primitive: Readonly<GltfPrimitive>,
  meshWeights: readonly number[] | undefined,
  warnings?: string[],
): MeshMorph | null {
  const gltfTargets = primitive.targets;
  if (gltfTargets === undefined || gltfTargets.length === 0) return null;

  const targets: MorphTarget[] = [];
  for (let t = 0; t < gltfTargets.length; t++) {
    const target: Readonly<GltfMorphTarget> = gltfTargets[t];
    if (target.POSITION === undefined) {
      warnings?.push(`buildGltfMorph: morph target ${t} has no POSITION delta; skipped`);
      continue;
    }
    const positionDeltas = Float32Array.from(readAccessor(doc, buffers, target.POSITION, warnings).data);
    const normalDeltas =
      target.NORMAL !== undefined ? Float32Array.from(readAccessor(doc, buffers, target.NORMAL, warnings).data) : null;
    const tangentDeltas =
      target.TANGENT !== undefined
        ? Float32Array.from(readAccessor(doc, buffers, target.TANGENT, warnings).data)
        : null;
    targets.push({ normalDeltas, positionDeltas, tangentDeltas });
  }
  if (targets.length === 0) return null;

  const weights = new Float32Array(targets.length);
  if (meshWeights !== undefined) {
    for (let i = 0; i < weights.length && i < meshWeights.length; i++) weights[i] = meshWeights[i];
  }
  return { targets, weights };
}

// Decodes a glTF accessor into a flat array, de-striding per `bufferView.byteStride` and decoding
// `normalized` integer attributes to their float ranges. Reads through a DataView (little-endian, as
// the spec mandates) so unaligned accessor/bufferView offsets are safe. Normalized accessors return a
// Float32Array; others return an array of the accessor's native component type (so uint32 index values
// stay exact).
function readAccessor(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  accessorIndex: number,
  warnings?: string[],
): { count: number; data: ArrayLike<number> } {
  const accessor = doc.accessors?.[accessorIndex];
  if (accessor === undefined) {
    warnings?.push(`readAccessor: accessor ${accessorIndex} not found in document`);
    return { count: 0, data: new Float32Array(0) };
  }

  const componentCount = TYPE_COMPONENTS[accessor.type];
  const componentByteSize = COMPONENT_BYTE_SIZE[accessor.componentType];
  const normalize = accessor.normalized === true && accessor.componentType !== 5126;
  const total = accessor.count * componentCount;
  const out = normalize ? new Float32Array(total) : createComponentArray(accessor.componentType, total);

  // Base values from the accessor's bufferView. A sparse accessor may omit the bufferView entirely, in
  // which case the base is a valid zero-fill that `sparse` then overrides at specific indices.
  const bufferViewIndex = accessor.bufferView ?? -1;
  const view = bufferViewIndex >= 0 ? doc.bufferViews?.[bufferViewIndex] : undefined;
  if (view !== undefined) {
    const bytes = buffers[view.buffer];
    if (bytes === undefined) {
      warnings?.push(`readAccessor: buffer ${view.buffer} not found for accessor ${accessorIndex}`);
      return { count: 0, data: new Float32Array(0) };
    }
    const elementByteSize = componentCount * componentByteSize;
    const stride = view.byteStride !== undefined && view.byteStride > 0 ? view.byteStride : elementByteSize;
    const baseOffset = bytes.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    // A truncated or unsupplied (empty) backing buffer would read past the DataView; guard the last
    // component's end against the buffer's real length and bail with empty rather than throwing.
    const lastByteEnd = accessor.count > 0 ? baseOffset + (accessor.count - 1) * stride + elementByteSize : baseOffset;
    if (lastByteEnd > bytes.byteOffset + bytes.byteLength) {
      warnings?.push(`readAccessor: accessor ${accessorIndex} runs past its buffer; returning empty`);
      return { count: 0, data: new Float32Array(0) };
    }
    const dataView = new DataView(bytes.buffer);
    for (let i = 0; i < accessor.count; i++) {
      const elementOffset = baseOffset + i * stride;
      for (let c = 0; c < componentCount; c++) {
        const raw = readComponent(dataView, accessor.componentType, elementOffset + c * componentByteSize);
        out[i * componentCount + c] = normalize ? normalizeComponent(accessor.componentType, raw) : raw;
      }
    }
  } else if (accessor.sparse === undefined) {
    warnings?.push(`readAccessor: bufferView ${bufferViewIndex} not found for accessor ${accessorIndex}`);
    return { count: 0, data: new Float32Array(0) };
  }

  if (accessor.sparse !== undefined) {
    applyAccessorSparse(
      doc,
      buffers,
      accessor.sparse,
      accessor.componentType,
      componentCount,
      normalize,
      out,
      warnings,
    );
  }

  return { count: accessor.count, data: out };
}

// Applies an accessor's sparse override in place: reads `sparse.count` element indices and the matching
// replacement elements, writing each element (componentCount values) over the base `out` array. Indices
// and values are tightly packed in their own bufferViews (no byteStride, per the spec).
function applyAccessorSparse(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  sparse: NonNullable<GltfAccessor['sparse']>,
  valueComponentType: GltfComponentType,
  componentCount: number,
  normalize: boolean,
  out: { [index: number]: number },
  warnings?: string[],
): void {
  const indicesView = doc.bufferViews?.[sparse.indices.bufferView];
  const valuesView = doc.bufferViews?.[sparse.values.bufferView];
  if (indicesView === undefined || valuesView === undefined) {
    warnings?.push('applyAccessorSparse: sparse indices or values bufferView not found; sparse override skipped');
    return;
  }
  const indexBytes = buffers[indicesView.buffer];
  const valueBytes = buffers[valuesView.buffer];
  if (indexBytes === undefined || valueBytes === undefined) {
    warnings?.push('applyAccessorSparse: sparse indices or values buffer not found; sparse override skipped');
    return;
  }
  const indexView = new DataView(indexBytes.buffer);
  const valueView = new DataView(valueBytes.buffer);
  const indexSize = COMPONENT_BYTE_SIZE[sparse.indices.componentType];
  const indexBase = indexBytes.byteOffset + (indicesView.byteOffset ?? 0) + (sparse.indices.byteOffset ?? 0);
  const valueSize = COMPONENT_BYTE_SIZE[valueComponentType];
  const valueBase = valueBytes.byteOffset + (valuesView.byteOffset ?? 0) + (sparse.values.byteOffset ?? 0);

  for (let s = 0; s < sparse.count; s++) {
    const targetIndex = readComponent(indexView, sparse.indices.componentType, indexBase + s * indexSize);
    for (let c = 0; c < componentCount; c++) {
      const raw = readComponent(valueView, valueComponentType, valueBase + (s * componentCount + c) * valueSize);
      out[targetIndex * componentCount + c] = normalize ? normalizeComponent(valueComponentType, raw) : raw;
    }
  }
}

// Reads one component at a byte offset, little-endian per the glTF spec.
function readComponent(view: Readonly<DataView>, componentType: GltfComponentType, offset: number): number {
  switch (componentType) {
    case 5120:
      return view.getInt8(offset);
    case 5121:
      return view.getUint8(offset);
    case 5122:
      return view.getInt16(offset, true);
    case 5123:
      return view.getUint16(offset, true);
    case 5125:
      return view.getUint32(offset, true);
    default:
      return view.getFloat32(offset, true);
  }
}

// Walks a GLB container: validates the 12-byte header and returns the parsed JSON document plus the
// optional BIN chunk. Returns null (with a warning) on any malformed header or chunk.
function readGlbContainer(
  bytes: Readonly<Uint8Array>,
  warnings?: string[],
): { binary: Uint8Array | null; document: GltfDocument } | null {
  if (bytes.byteLength < GLB_HEADER_BYTES) {
    warnings?.push('createSceneFromGlb: byte length is smaller than the 12-byte GLB header');
    return null;
  }
  const source = bytes as Uint8Array;
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    warnings?.push("createSceneFromGlb: magic is not 'glTF'; not a GLB container");
    return null;
  }
  const version = view.getUint32(4, true);
  if (version !== 2) {
    warnings?.push(`createSceneFromGlb: unsupported GLB container version ${version} (expected 2)`);
    return null;
  }
  const declaredLength = view.getUint32(8, true);
  const end = Math.min(declaredLength, source.byteLength);

  let document: GltfDocument | null = null;
  let binary: Uint8Array | null = null;
  let offset = GLB_HEADER_BYTES;
  while (offset + GLB_CHUNK_HEADER_BYTES <= end) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const dataStart = offset + GLB_CHUNK_HEADER_BYTES;
    if (dataStart + chunkLength > end) {
      warnings?.push('createSceneFromGlb: chunk length runs past the end of the container');
      break;
    }
    const chunkData = source.subarray(dataStart, dataStart + chunkLength);
    if (chunkType === GLB_JSON_CHUNK && document === null) {
      const json = new TextDecoder().decode(chunkData);
      try {
        document = JSON.parse(json) as GltfDocument;
      } catch {
        warnings?.push('createSceneFromGlb: JSON chunk is not valid JSON');
        return null;
      }
    } else if (chunkType === GLB_BIN_CHUNK && binary === null) {
      binary = chunkData;
    }
    offset = dataStart + chunkLength;
  }

  if (document === null) {
    warnings?.push('createSceneFromGlb: no JSON chunk found in the container');
    return null;
  }
  return { binary, document };
}

function topLevelNodeIndices(nodes: readonly Readonly<GltfNode>[]): number[] {
  const referenced = new Set<number>();
  for (const node of nodes) {
    if (node.children !== undefined) for (const c of node.children) referenced.add(c);
  }
  const roots: number[] = [];
  for (let i = 0; i < nodes.length; i++) if (!referenced.has(i)) roots.push(i);
  return roots;
}

type ComponentArray = Float32Array | Int8Array | Int16Array | Uint8Array | Uint16Array | Uint32Array;

// Allocates a typed array matching the accessor's component type, so integer (e.g. uint32 index)
// values survive without a float round-trip.
function createComponentArray(componentType: GltfComponentType, length: number): ComponentArray {
  switch (componentType) {
    case 5120:
      return new Int8Array(length);
    case 5121:
      return new Uint8Array(length);
    case 5122:
      return new Int16Array(length);
    case 5123:
      return new Uint16Array(length);
    case 5125:
      return new Uint32Array(length);
    default:
      return new Float32Array(length);
  }
}

const COMPONENT_BYTE_SIZE: Record<GltfComponentType, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS: Record<string, number> = { MAT2: 4, MAT3: 9, MAT4: 16, SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

// glTF TRS animation target paths → Flight SceneAnimationPath. The 'weights' (morph) path is handled
// separately by the caller (appendGltfWeightsChannels), because it binds to a mesh's weight array with a
// mesh-specific track width rather than a fixed-width transform component, so it is not in this map.
const GLTF_ANIMATION_PATHS: Record<string, SceneAnimationPath | undefined> = {
  rotation: SceneAnimationPathRotation,
  scale: SceneAnimationPathScale,
  translation: SceneAnimationPathTranslation,
};

// glTF sampler interpolation → Flight AnimationInterpolation (same three modes, same CUBICSPLINE
// in-tangent/value/out-tangent layout).
const GLTF_SAMPLER_INTERPOLATIONS: Record<string, AnimationInterpolation> = {
  CUBICSPLINE: 'Cubic',
  LINEAR: 'Linear',
  STEP: 'Step',
};

// glTF sampler min/mag filter GL enums → Flight TextureFilter. glTF's mip-aware min filters
// (LINEAR_MIPMAP_LINEAR etc.) map onto Flight's mip-aware filter names; the mag filter is always a
// non-mip mode (NEAREST/LINEAR).
const GLTF_TEXTURE_FILTER: Record<number, TextureFilter> = {
  9728: 'nearest',
  9729: 'linear',
  9984: 'nearest-mipmap-nearest',
  9985: 'linear-mipmap-nearest',
  9986: 'nearest-mipmap-linear',
  9987: 'linear-mipmap-linear',
};

// Whether a glTF min-filter GL enum implies a sampled mip chain — the four *_MIPMAP_* modes do, the
// plain NEAREST/LINEAR do not. Sets Sampler.mipmaps so a non-mip filter does not force mip generation.
const GLTF_MIN_FILTER_MIPMAPS: Record<number, boolean> = {
  9728: false,
  9729: false,
  9984: true,
  9985: true,
  9986: true,
  9987: true,
};

// glTF sampler wrap GL enums → Flight TextureWrap. REPEAT (10497), CLAMP_TO_EDGE (33071),
// MIRRORED_REPEAT (33648).
const GLTF_TEXTURE_WRAP: Record<number, TextureWrap> = {
  10497: 'repeat',
  33071: 'clamp-to-edge',
  33648: 'mirror-repeat',
};

// GLB container constants: the header magic (`glTF` little-endian), chunk-type tags (`JSON` and
// `BIN\0` little-endian), and the fixed header/chunk-header byte sizes.
const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;

// The canonical interleaved PBR vertex layout the mesh builders and scene-{gl,wgpu} renderers share,
// plus the skinned record's floats-per-vertex — the same constants every scene-formats importer emits.
import {
  CANONICAL_FLOATS_PER_VERTEX,
  CANONICAL_LAYOUT,
  createEmbeddedTextureRef,
  createExternalTextureRef,
  SKINNED_FLOATS_PER_VERTEX,
} from './shared';
