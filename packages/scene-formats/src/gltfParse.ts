import { createAnimationTrack } from '@flighthq/animation';
import { packLinearToColor } from '@flighthq/color';
import { createTransform3D, decomposeMatrix4ToTransform3D } from '@flighthq/geometry';
import { detectImageMimeType } from '@flighthq/image-codec';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, createMeshGeometry } from '@flighthq/mesh';
import type { Scene } from '@flighthq/scene';
import { createSceneFromDocument, createScenesFromDocument } from '@flighthq/scene';
import type {
  AnimationInterpolation,
  Material,
  MaterialLike,
  MeshGeometry,
  MeshMorph,
  MorphTarget,
  PrimitiveTopology,
  SceneAnimationPath,
  SceneDocument,
  SceneDocumentAnimation,
  SceneDocumentAnimationChannel,
  SceneDocumentMesh,
  SceneDocumentNode,
  SceneDocumentSkin,
  Texture,
  TextureColorSpace,
  TextureFilter,
  TextureWrap,
  Transform3D,
} from '@flighthq/types';
import {
  MeshKind,
  SceneAnimationPathRotation,
  SceneAnimationPathScale,
  SceneAnimationPathTranslation,
  SceneAnimationPathWeights,
  SceneNodeKind,
} from '@flighthq/types';

import type {
  GltfAccessor,
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

// Parses a binary glTF (`.glb`) container into a Scene — the file's default scene (`doc.scene`).
// Convenience over `createSceneFromDocument(parseGlb(bytes), defaultScene)`; malformed containers return an
// empty Scene.
export function createSceneFromGlb(
  bytes: Readonly<Uint8Array>,
  warnings?: string[],
  options?: Readonly<GltfImportOptions>,
): Scene {
  const container = readGlbContainer(bytes, warnings);
  if (container === null) return createSceneFromDocument(createEmptyGltfDocument());
  return createSceneFromDocument(
    buildGltfDocument(container.document, container.binary, options, warnings),
    container.document.scene ?? 0,
  );
}

// Parses a glTF 2.0 document (JSON string or already-parsed object) into a Scene — the file's default scene
// (`doc.scene`). Convenience over `createSceneFromDocument(parseGltf(source), defaultScene)`; a malformed
// JSON string returns an empty Scene.
export function createSceneFromGltf(
  source: GltfDocument | string,
  warnings?: string[],
  options?: Readonly<GltfImportOptions>,
): Scene {
  const doc = parseGltfSource(source, warnings);
  if (doc === null) return createSceneFromDocument(createEmptyGltfDocument());
  return createSceneFromDocument(buildGltfDocument(doc, null, options, warnings), doc.scene ?? 0);
}

// Parses a binary glTF (`.glb`) container into every scene it declares (`Scene[]`), each carrying its
// geometry; the file's animation clips are attached to the default scene. Malformed containers return an
// empty array.
export function createScenesFromGlb(
  bytes: Readonly<Uint8Array>,
  warnings?: string[],
  options?: Readonly<GltfImportOptions>,
): Scene[] {
  return createScenesFromDocument(parseGlb(bytes, warnings, options));
}

// Parses a glTF 2.0 document into every scene it declares (`Scene[]`), each carrying its geometry; the
// file's animation clips are attached to the default scene. Reach for this over createSceneFromGltf when the
// file declares multiple scenes. A malformed JSON string returns an empty array.
export function createScenesFromGltf(
  source: GltfDocument | string,
  warnings?: string[],
  options?: Readonly<GltfImportOptions>,
): Scene[] {
  return createScenesFromDocument(parseGltf(source, warnings, options));
}

// Parses a binary glTF (`.glb`) container into a format-neutral SceneDocument. The 12-byte header (magic
// `glTF`, version, length) is validated, then the chunk stream is walked to extract the embedded JSON
// document and the optional BIN chunk; the BIN chunk backs any buffer that has no `uri`. `options` supplies
// external buffer bytes and a base path for any external URIs the GLB still references. Malformed containers
// return an empty document and push a warning rather than throwing. Assemble it into a live Scene with
// `createSceneFromDocument`.
export function parseGlb(
  bytes: Readonly<Uint8Array>,
  warnings?: string[],
  options?: Readonly<GltfImportOptions>,
): SceneDocument {
  const container = readGlbContainer(bytes, warnings);
  if (container === null) return createEmptyGltfDocument();
  return buildGltfDocument(container.document, container.binary, options, warnings);
}

// Parses a glTF 2.0 document (JSON string or already-parsed object) into a format-neutral SceneDocument:
// the node hierarchy with transforms, meshes (inline geometry + materials), skins, morph, and animation.
// A malformed JSON string returns an empty document and pushes a warning rather than throwing. Assemble it
// into a live Scene with `createSceneFromDocument`.
//
// Imported today: POSITION + optional NORMAL / TANGENT / TEXCOORD_0 + indices, interleaved into the
// canonical PBR vertex layout (or the skinned layout when JOINTS_0/WEIGHTS_0 are present); skins (joint
// hierarchy + inverse-bind matrices); every `primitives[]` entry of a mesh (multi-primitive → sub-mesh
// child nodes); strided (`byteStride`) and normalized-integer accessors; sparse accessors; materials
// (metallic-roughness PBR → StandardPbrMaterial); textures with their sampler (wrap/filter), color space
// (srgb for baseColor/emissive, linear for data maps), and KHR_texture_transform UV remap, resolving
// embedded bytes to Embedded refs and external URIs to External refs (against `options.basePath`); external
// (`.bin`) buffers via `options.externalBuffers`.
export function parseGltf(
  source: GltfDocument | string,
  warnings?: string[],
  options?: Readonly<GltfImportOptions>,
): SceneDocument {
  const doc = parseGltfSource(source, warnings);
  if (doc === null) return createEmptyGltfDocument();
  return buildGltfDocument(doc, null, options, warnings);
}

// Parses the JSON string or accepts the already-parsed object, returning null (with a warning) on invalid
// JSON or a non-object document.
function parseGltfSource(source: GltfDocument | string, warnings?: string[]): GltfDocument | null {
  let doc: GltfDocument;
  if (typeof source === 'string') {
    try {
      doc = JSON.parse(source) as GltfDocument;
    } catch {
      warnings?.push('parseGltf: source is not valid JSON; returning empty document');
      return null;
    }
  } else {
    doc = source;
  }
  if (doc === null || typeof doc !== 'object') {
    warnings?.push('parseGltf: document is not an object; returning empty document');
    return null;
  }
  return doc;
}

// The empty SceneDocument returned when parsing fails — every table present and empty, so callers and the
// assembler never special-case a partial document.
function createEmptyGltfDocument(): SceneDocument {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [],
    skins: [],
  };
}

// Builds the format-neutral SceneDocument from a parsed glTF document plus an optional GLB binary chunk
// (null for the JSON path). This is the decomposition the importer stops at: inline mesh geometry, resolved
// materials, node tables with index refs, skins by joint index, and node-index-bound animation channels —
// `createSceneFromDocument` assembles it into live entities. A multi-primitive glTF mesh expands into a
// group node with one child mesh node per primitive, so every document mesh carries exactly one geometry.
function buildGltfDocument(
  doc: Readonly<GltfDocument>,
  binary: Readonly<Uint8Array> | null,
  options: Readonly<GltfImportOptions> | undefined,
  warnings?: string[],
): SceneDocument {
  const version = doc.asset?.version;
  if (version === undefined || !isSupportedGltfVersion(version)) {
    warnings?.push(`parseGltf: unsupported glTF asset.version '${version ?? '(missing)'}' (expected 2.x)`);
  }
  if (doc.extensionsRequired !== undefined) {
    for (const extension of doc.extensionsRequired) {
      if (isSupportedGltfExtension(extension)) continue;
      warnings?.push(`parseGltf: required extension '${extension}' is not supported and was ignored`);
    }
  }

  const buffers = (doc.buffers ?? []).map((buffer) => decodeGltfBuffer(buffer, binary, options, warnings));
  const materials: MaterialLike[] = (doc.materials ?? []).map(
    (material) => gltfMaterialToPbr(doc, buffers, material, options) as MaterialLike,
  );

  // One document mesh per glTF primitive (inline geometry + morph + material indices). Track, per glTF
  // mesh, the list of document-mesh indices it expands to, so a node can point at the right ones.
  const meshes: SceneDocumentMesh[] = [];
  const gltfMeshToDocMeshes: number[][] = (doc.meshes ?? []).map((gltfMesh) => {
    const docMeshIndices: number[] = [];
    for (let p = 0; p < gltfMesh.primitives.length; p++) {
      const primitive = gltfMesh.primitives[p];
      const morph = buildGltfMorph(doc, buffers, primitive, gltfMesh.weights, warnings);
      const documentMesh: SceneDocumentMesh = {
        geometry: primitiveToGeometry(doc, buffers, primitive, warnings),
        materials: primitive.material !== undefined ? [primitive.material] : [],
      };
      if (morph !== null) documentMesh.morph = morph;
      docMeshIndices.push(meshes.length);
      meshes.push(documentMesh);
    }
    return docMeshIndices;
  });

  const gltfNodes = doc.nodes ?? [];
  const nodes: SceneDocumentNode[] = [];
  // Maps a glTF node index to the document node index that carries its transform + hierarchy. For a
  // multi-primitive mesh the group node holds the transform and the extra primitives become its children.
  const gltfNodeToDocNode: number[] = new Array(gltfNodes.length);
  // For a glTF node whose mesh has N>1 primitives, the document node indices of its per-primitive child
  // mesh nodes (so an animation weights channel can fan out to each). Empty for single-primitive nodes.
  const gltfNodePrimitiveNodes: number[][] = gltfNodes.map(() => []);

  for (let i = 0; i < gltfNodes.length; i++) {
    const gltfNode = gltfNodes[i];
    const transform = gltfNodeTransform(gltfNode);
    const docMeshes = gltfNode.mesh !== undefined ? gltfMeshToDocMeshes[gltfNode.mesh] : undefined;
    const nodeIndex = nodes.length;
    gltfNodeToDocNode[i] = nodeIndex;
    if (docMeshes !== undefined && docMeshes.length === 1) {
      nodes.push({ children: [], kind: MeshKind, mesh: docMeshes[0], name: gltfNode.name, transform });
    } else if (docMeshes !== undefined && docMeshes.length > 1) {
      // Group node holds the transform; one child mesh node per primitive (identity transform).
      const group: SceneDocumentNode = { children: [], kind: SceneNodeKind, name: gltfNode.name, transform };
      nodes.push(group);
      for (let m = 0; m < docMeshes.length; m++) {
        const childIndex = nodes.length;
        group.children.push(childIndex);
        gltfNodePrimitiveNodes[i].push(childIndex);
        nodes.push({ children: [], kind: MeshKind, mesh: docMeshes[m], transform: createIdentityTransform() });
      }
    } else {
      nodes.push({ children: [], kind: SceneNodeKind, name: gltfNode.name, transform });
    }
  }

  // Wire the glTF child hierarchy onto the document group/leaf nodes (each glTF node's own doc node).
  for (let i = 0; i < gltfNodes.length; i++) {
    const children = gltfNodes[i].children;
    if (children === undefined) continue;
    const parent = nodes[gltfNodeToDocNode[i]];
    for (let c = 0; c < children.length; c++) parent.children.push(gltfNodeToDocNode[children[c]]);
  }

  const skins = buildGltfSkins(doc, buffers, gltfNodeToDocNode, warnings);
  // Bind each glTF node's skin onto the document mesh(es) it produced (mesh.skin = skin index).
  for (let i = 0; i < gltfNodes.length; i++) {
    const skinIndex = gltfNodes[i].skin;
    if (skinIndex === undefined || gltfNodes[i].mesh === undefined) continue;
    const meshIndicesForNode = gltfMeshToDocMeshes[gltfNodes[i].mesh as number] ?? [];
    for (let m = 0; m < meshIndicesForNode.length; m++) meshes[meshIndicesForNode[m]].skin = skinIndex;
  }

  const scenes = (doc.scenes ?? [{ nodes: topLevelNodeIndices(gltfNodes) }]).map((scene) => ({
    name: scene.name,
    rootNodes: (scene.nodes ?? []).map((n) => gltfNodeToDocNode[n]),
  }));

  const animations = buildGltfAnimations(
    doc,
    buffers,
    gltfNodeToDocNode,
    gltfNodePrimitiveNodes,
    nodes,
    meshes,
    warnings,
  );

  return {
    animations,
    cameras: [],
    lights: [],
    materials,
    meshes,
    metadata: buildGltfMetadata(doc),
    nodes,
    resources: [],
    scenes,
    skins,
  };
}

// Builds the document's skin table: each glTF `skins[]` entry becomes a SceneDocumentSkin whose `joints` are
// document node indices and whose `inverseBind` is one Matrix4 per joint (identity per the spec when the
// accessor is absent).
function buildGltfSkins(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  gltfNodeToDocNode: readonly number[],
  warnings?: string[],
): SceneDocumentSkin[] {
  return (doc.skins ?? []).map((gltfSkin) => {
    const joints = gltfSkin.joints.map((jointNodeIndex) => gltfNodeToDocNode[jointNodeIndex]);
    const inverseBind: { m: Float32Array }[] = [];
    if (gltfSkin.inverseBindMatrices !== undefined) {
      const flat = readAccessor(doc, buffers, gltfSkin.inverseBindMatrices, warnings).data;
      for (let j = 0; j < joints.length; j++) {
        inverseBind.push({ m: Float32Array.from({ length: 16 }, (_, k) => flat[j * 16 + k] ?? 0) });
      }
    } else {
      for (let j = 0; j < joints.length; j++) inverseBind.push({ m: identityMatrix16() });
    }
    return { inverseBind, joints };
  });
}

// Builds the document's animation table. Each glTF animation becomes a SceneDocumentAnimation whose channels
// carry a document node index + SceneAnimationPath + a sampled AnimationTrack. A `weights` (morph) channel
// fans out to each morphable mesh node the target produced (the group's per-primitive children, or the leaf
// mesh node itself), its track width set to that mesh's morph-target count.
function buildGltfAnimations(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  gltfNodeToDocNode: readonly number[],
  gltfNodePrimitiveNodes: readonly number[][],
  nodes: readonly SceneDocumentNode[],
  meshes: readonly SceneDocumentMesh[],
  warnings?: string[],
): SceneDocumentAnimation[] {
  const animations: SceneDocumentAnimation[] = [];
  const gltfAnimations = doc.animations ?? [];
  for (let a = 0; a < gltfAnimations.length; a++) {
    const animation = gltfAnimations[a];
    const channels: SceneDocumentAnimationChannel[] = [];
    let duration = 0;
    for (const channel of animation.channels) {
      const targetNodeIndex = channel.target.node;
      if (targetNodeIndex === undefined || gltfNodeToDocNode[targetNodeIndex] === undefined) continue;
      const sampler = animation.samplers[channel.sampler];
      if (sampler === undefined) {
        warnings?.push(`parseGltf: animation channel references missing sampler ${channel.sampler}`);
        continue;
      }
      const times = readAccessor(doc, buffers, sampler.input, warnings).data;
      const values = readAccessor(doc, buffers, sampler.output, warnings).data;
      duration = Math.max(duration, times.length > 0 ? times[times.length - 1] : 0);

      if (channel.target.path === 'weights') {
        // A multi-primitive mesh's morphable mesh nodes are its per-primitive children; a single-primitive
        // mesh is the target's own document node. Fan the per-mesh glTF weights channel to each.
        const meshNodeIndices =
          gltfNodePrimitiveNodes[targetNodeIndex].length > 0
            ? gltfNodePrimitiveNodes[targetNodeIndex]
            : [gltfNodeToDocNode[targetNodeIndex]];
        appendGltfWeightsChannels(
          channels,
          meshNodeIndices,
          nodes,
          meshes,
          times,
          values,
          sampler.interpolation,
          warnings,
        );
        continue;
      }
      const path = GLTF_ANIMATION_PATHS[channel.target.path];
      if (path === undefined) {
        warnings?.push(`parseGltf: unsupported animation target path '${channel.target.path}'`);
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
      channels.push({ node: gltfNodeToDocNode[targetNodeIndex], path, track });
    }
    if (channels.length > 0) animations.push({ channels, duration, name: animation.name ?? `animation${a}` });
  }
  return animations;
}

// Appends a Weights (morph) animation channel for each morphable mesh node the target produced (already
// resolved to document node indices: a single-primitive mesh's own node, or a multi-primitive mesh's
// per-primitive child mesh nodes — glTF weights are per-mesh and applied to every primitive). Each channel's
// track width is that mesh's morph-target count so the per-keyframe value block samples straight into the
// mesh's weight array. A target with no morphable mesh yields no channel (silently dropped).
function appendGltfWeightsChannels(
  channels: SceneDocumentAnimationChannel[],
  meshNodeIndices: readonly number[],
  nodes: readonly SceneDocumentNode[],
  meshes: readonly SceneDocumentMesh[],
  times: ArrayLike<number>,
  values: ArrayLike<number>,
  interpolation: string | undefined,
  warnings?: string[],
): void {
  let bound = 0;
  for (let i = 0; i < meshNodeIndices.length; i++) {
    const meshIndex = nodes[meshNodeIndices[i]]?.mesh;
    const morph = meshIndex !== undefined ? meshes[meshIndex]?.morph : null;
    if (morph == null || morph.targets.length === 0) continue;
    const track = createAnimationTrack({
      components: morph.targets.length,
      interpolation: GLTF_SAMPLER_INTERPOLATIONS[interpolation ?? 'LINEAR'],
      times,
      values,
    });
    channels.push({ node: meshNodeIndices[i], path: SceneAnimationPathWeights, track });
    bound++;
  }
  if (bound === 0) {
    warnings?.push('parseGltf: weights channel targets a node with no morphable mesh; skipped');
  }
}

// The document metadata for a glTF file — currently null, since the imported glTF schema subset carries no
// provenance fields (asset.generator/copyright are not read). Kept as a named seam so a future asset-block
// read populates it in one place.
function buildGltfMetadata(_doc: Readonly<GltfDocument>): null {
  return null;
}

// An identity decomposed transform for a synthesized child mesh node (a multi-primitive mesh's per-primitive
// children draw at the group's transform, so their own local transform is identity).
function createIdentityTransform(): Transform3D {
  return createTransform3D();
}

// The document transform for a glTF node: its 16-float column-major `matrix` decomposed to TRS (lossy only
// on shear, which glTF authoring does not produce), or its explicit translation/rotation/scale fields, or
// the identity when the node authors neither.
function gltfNodeTransform(gltfNode: Readonly<GltfNode>): Transform3D {
  const transform = createTransform3D();
  if (gltfNode.matrix !== undefined) {
    decomposeMatrix4ToTransform3D(transform, { m: new Float32Array(gltfNode.matrix) });
    return transform;
  }
  const t = gltfNode.translation;
  const r = gltfNode.rotation;
  const s = gltfNode.scale;
  if (t !== undefined) {
    transform.position.x = t[0] ?? 0;
    transform.position.y = t[1] ?? 0;
    transform.position.z = t[2] ?? 0;
  }
  if (r !== undefined) {
    transform.rotation.x = r[0] ?? 0;
    transform.rotation.y = r[1] ?? 0;
    transform.rotation.z = r[2] ?? 0;
    transform.rotation.w = r[3] ?? 1;
  }
  if (s !== undefined) {
    transform.scale.x = s[0] ?? 1;
    transform.scale.y = s[1] ?? 1;
    transform.scale.z = s[2] ?? 1;
  }
  return transform;
}

// A fresh 16-float identity matrix for a skin joint with no inverse-bind accessor (spec default).
function identityMatrix16(): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
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

// Names only the extensions the core parser actually consumes today. This prevents required-extension
// diagnostics from contradicting visible behavior while the open handler registry remains a separate
// depth step; adding a schema field alone must not count as support.
function isSupportedGltfExtension(extension: string): boolean {
  return extension === 'KHR_texture_transform';
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
  const sourceIndices =
    primitive.indices !== undefined
      ? Uint32Array.from(readAccessor(doc, buffers, primitive.indices, warnings).data)
      : undefined;
  const primitiveElements = buildGltfPrimitiveElements(primitive.mode ?? 4, sourceIndices, vertexCount, warnings);
  return createMeshGeometry({
    indices: primitiveElements.indices,
    layout: skinned ? CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT : CANONICAL_LAYOUT,
    topology: primitiveElements.topology,
    vertices,
  });
}

function buildGltfPrimitiveElements(
  mode: number,
  source: Uint32Array<ArrayBuffer> | undefined,
  vertexCount: number,
  warnings?: string[],
): { indices: Uint32Array<ArrayBuffer> | undefined; topology: PrimitiveTopology } {
  switch (mode) {
    case 0:
      return { indices: source, topology: 'point-list' };
    case 1:
      return { indices: source, topology: 'line-list' };
    case 2:
      return { indices: buildGltfLineLoopIndices(source, vertexCount), topology: 'line-list' };
    case 3:
      return { indices: source, topology: 'line-strip' };
    case 4:
      return { indices: source, topology: 'triangle-list' };
    case 5:
      return { indices: source, topology: 'triangle-strip' };
    case 6:
      return { indices: buildGltfTriangleFanIndices(source, vertexCount), topology: 'triangle-list' };
    default:
      warnings?.push(`primitiveToGeometry: primitive mode ${mode} is not a glTF 2.0 mode; primitive omitted`);
      return { indices: new Uint32Array(0), topology: 'triangle-list' };
  }
}

function buildGltfLineLoopIndices(
  source: Readonly<Uint32Array<ArrayBuffer>> | undefined,
  vertexCount: number,
): Uint32Array<ArrayBuffer> {
  const count = source?.length ?? vertexCount;
  if (count < 2) return new Uint32Array(0);
  const out = new Uint32Array(count * 2);
  for (let i = 0; i < count; i++) {
    out[i * 2] = source?.[i] ?? i;
    out[i * 2 + 1] = source?.[(i + 1) % count] ?? (i + 1) % count;
  }
  return out;
}

function buildGltfTriangleFanIndices(
  source: Readonly<Uint32Array<ArrayBuffer>> | undefined,
  vertexCount: number,
): Uint32Array<ArrayBuffer> {
  const count = source?.length ?? vertexCount;
  if (count < 3) return new Uint32Array(0);
  const out = new Uint32Array((count - 2) * 3);
  const first = source?.[0] ?? 0;
  for (let i = 1; i + 1 < count; i++) {
    const offset = (i - 1) * 3;
    out[offset] = first;
    out[offset + 1] = source?.[i] ?? i;
    out[offset + 2] = source?.[i + 1] ?? i + 1;
  }
  return out;
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
