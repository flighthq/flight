import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation';
import {
  copyMatrix4,
  createMatrix4,
  createTransform3D,
  decomposeMatrix4ToTransform3D,
  inverseMatrix4,
  multiplyMatrix4,
} from '@flighthq/geometry';
import { detectImageMimeType } from '@flighthq/image-codec';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  computeMeshGeometryNormals,
  computeMeshGeometryTangents,
  createMeshGeometry,
} from '@flighthq/mesh';
import { createSceneFromDocument } from '@flighthq/scene';
import { createShadedMaterial } from '@flighthq/shading';
import type { Scene } from '@flighthq/types';
import type {
  AnimationClip,
  AnimationTrack,
  AwdDecompressor,
  Material,
  MaterialLike,
  Matrix4,
  SceneDocument,
  SceneDocumentAnimation,
  SceneDocumentAnimationChannel,
  SceneDocumentMesh,
  SceneDocumentNode,
  SceneDocumentSkin,
  SceneNode,
  SurfaceMaterial,
  Texture,
  Transform3D,
  SkinInfluence,
} from '@flighthq/types';
import {
  MeshKind,
  SceneAnimationPathRotation,
  SceneAnimationPathScale,
  SceneAnimationPathTranslation,
  SceneNodeKind,
} from '@flighthq/types';

import {
  AWD2_BLOCK_CONTAINER,
  AWD2_BLOCK_HEADER_BYTES,
  AWD2_BLOCK_MATERIAL,
  AWD2_BLOCK_MESH_INSTANCE,
  AWD2_BLOCK_SKELETON,
  AWD2_BLOCK_SKELETON_ANIMATION,
  AWD2_BLOCK_SKELETON_POSE,
  AWD2_BLOCK_TEXTURE,
  AWD2_BLOCK_TRIANGLE_GEOMETRY,
  AWD2_COMPRESSION_NONE,
  AWD2_DATA_FLOAT32,
  AWD2_DATA_FLOAT64,
  AWD2_DATA_INT16,
  AWD2_DATA_INT32,
  AWD2_DATA_INT8,
  AWD2_DATA_UINT16,
  AWD2_DATA_UINT32,
  AWD2_DATA_UINT8,
  AWD2_FORMAT_VERSION,
  AWD2_HEADER_BYTES,
  AWD2_MAGIC_0,
  AWD2_MAGIC_1,
  AWD2_MAGIC_2,
  AWD2_MATERIAL_PROP_ALPHA,
  AWD2_MATERIAL_PROP_COLOR,
  AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE,
  AWD2_MATERIAL_PROP_NORMAL_TEXTURE,
  AWD2_NAMESPACE_CORE,
  AWD2_STREAM_INDICES,
  AWD2_STREAM_JOINT_INDICES,
  AWD2_STREAM_JOINT_WEIGHTS,
  AWD2_STREAM_NORMALS,
  AWD2_STREAM_POSITIONS,
  AWD2_STREAM_TANGENTS,
  AWD2_STREAM_UVS,
  AWD2_TEXTURE_TYPE_EMBEDDED,
  AWD2_VERSION_MAJOR_OFFSET,
} from './awd2Schema';
import {
  CANONICAL_FLOATS_PER_VERTEX,
  CANONICAL_LAYOUT,
  convertTransformLhToRh,
  createEmbeddedTextureRef,
  createExternalTextureRef,
  negateVec3Z,
  packSkinInfluences,
  reverseTriangleWinding,
  SKINNED_FLOATS_PER_VERTEX,
} from './shared';

// Parses an Away3D AWD 2.x binary file into a Scene. Convenience over `createSceneFromDocument(parseAwd2
// (bytes, warnings))`. See parseAwd2 for the import model.
export function createSceneFromAwd2(bytes: Readonly<Uint8Array>, warnings?: string[]): Scene {
  return createSceneFromDocument(parseAwd2(bytes, warnings));
}

// Parses an Away3D AWD 2.x binary file into a format-neutral SceneDocument. The 12-byte header (magic
// `AWD`, version, flags, compression, body length) is validated, then the block stream is walked to
// extract geometry blocks (type 1), container blocks (type 22), mesh-instance blocks (type 23), material
// blocks (type 81), texture blocks (type 82), and the skeleton block (type 101). Mesh instances reference
// geometry and material blocks by block ID; materials reference texture blocks the same way.
//
// The file's skeleton (if any) becomes a skeleton-group + joint node subtree in the document node table
// (`nodes`) plus one entry in `skins` (its `joints` are those joint node indices, its `inverseBind` the
// AWD joint matrices, which ARE the inverse bind pose); each skinned sub-mesh's document mesh names that
// skin by index. Containers become group nodes, mesh instances become mesh nodes (one geometry → one mesh
// node carrying the instance name; several geometries → a named group of anonymous per-subset mesh nodes),
// and parenting is expressed through `children` index lists with the unparented nodes as scene roots. Each
// AWD material becomes a ShadedMaterial in the document `materials` table — AWD's AwayJS MethodMaterial model
// (BlinnPhong base + method array) maps structurally onto ShadedMaterial (base + modifier stack); see the
// resolveAwdMaterial note for why the mapping is uniform. It carries the diffuse color+alpha and/or a
// diffuseMap/normalMap referencing an unresolved AWD texture ImageResourceReference — the parser references,
// it does not fetch or decode; the resolution is
// @flighthq/scene-resources's explicit pass. The file's skeleton animations become document `animations`
// whose channels bind by joint node index. Assemble into a live Scene with `createSceneFromDocument`.
//
// A compressed body (Away3D's exporter default — deflate or LZMA) is inflated first when a decompressor
// has been registered for that compression method via `registerAwd2Decompressor`; with no codec registered
// the file pushes a warning and returns an empty document. Malformed input warns and returns empty rather
// than throwing.
export function parseAwd2(bytes: Readonly<Uint8Array>, warnings?: string[]): SceneDocument {
  const input = bytes as Uint8Array;
  if (input.byteLength < AWD2_HEADER_BYTES) {
    warnings?.push('createSceneFromAwd2: byte length is smaller than the 12-byte AWD header');
    return emptyAwdDocument();
  }

  if (input[0] !== AWD2_MAGIC_0 || input[1] !== AWD2_MAGIC_1 || input[2] !== AWD2_MAGIC_2) {
    warnings?.push("createSceneFromAwd2: magic is not 'AWD'; not an AWD file");
    return emptyAwdDocument();
  }

  if (!isAwd2Version(input, 'createSceneFromAwd2', warnings)) return emptyAwdDocument();

  // A compressed body is inflated (via a registered decompressor) and spliced back behind the header so
  // the block walk below is identical for compressed and uncompressed input; bails to empty when no codec
  // is registered for the file's compression method.
  const rehydrated = rehydrateAwdBody(input, 'createSceneFromAwd2', warnings);
  if (rehydrated === null) return emptyAwdDocument();
  const source = rehydrated.source;
  const view = rehydrated.view;

  const bodyLength = view.getUint32(8, true);
  const bodyEnd = Math.min(AWD2_HEADER_BYTES + bodyLength, source.byteLength);

  const geometryBlocks = new Map<number, ParsedGeometry[]>();
  const containerBlocks = new Map<number, ParsedContainer>();
  const meshInstanceBlocks = new Map<number, ParsedMeshInstance>();
  const materialBlocks = new Map<number, ParsedMaterial>();
  const textureBlocks = new Map<number, ParsedTexture>();
  const skeletonBlocks = new Map<number, ParsedSkeleton>();

  let offset = AWD2_HEADER_BYTES;
  while (offset + AWD2_BLOCK_HEADER_BYTES <= bodyEnd) {
    const blockId = view.getUint32(offset, true);
    const namespace = source[offset + 4];
    const blockType = source[offset + 5];
    const blockFlags = source[offset + 6];
    const blockLength = view.getUint32(offset + 7, true);
    const blockDataStart = offset + AWD2_BLOCK_HEADER_BYTES;

    if (blockDataStart + blockLength > bodyEnd) {
      warnings?.push('createSceneFromAwd2: block length runs past the end of the body');
      break;
    }

    const matrixWide = (blockFlags & 1) !== 0;
    const geometryWide = (blockFlags & 2) !== 0;

    if (namespace === AWD2_NAMESPACE_CORE) {
      if (blockType === AWD2_BLOCK_TRIANGLE_GEOMETRY) {
        const geoms = parseTriangleGeometryBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          geometryWide,
          warnings,
        );
        geometryBlocks.set(blockId, geoms);
      } else if (blockType === AWD2_BLOCK_CONTAINER) {
        const container = parseContainerBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          warnings,
        );
        if (container !== null) containerBlocks.set(blockId, container);
      } else if (blockType === AWD2_BLOCK_MESH_INSTANCE) {
        const meshInst = parseMeshInstanceBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          warnings,
        );
        if (meshInst !== null) meshInstanceBlocks.set(blockId, meshInst);
      } else if (blockType === AWD2_BLOCK_MATERIAL) {
        const material = parseMaterialBlock(view, source, blockDataStart, blockDataStart + blockLength, warnings);
        if (material !== null) materialBlocks.set(blockId, material);
      } else if (blockType === AWD2_BLOCK_TEXTURE) {
        const texture = parseTextureBlock(view, source, blockDataStart, blockDataStart + blockLength, warnings);
        if (texture !== null) textureBlocks.set(blockId, texture);
      } else if (blockType === AWD2_BLOCK_SKELETON) {
        const skeleton = parseSkeletonBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          warnings,
        );
        if (skeleton !== null) skeletonBlocks.set(blockId, skeleton);
      }
    }

    offset = blockDataStart + blockLength;
  }

  const document = emptyAwdDocument();
  // Maps an AWD block id to the document node index it produced (containers + mesh instances), so parenting
  // can rewire the flat node array by index the way the scene graph did by SceneNode reference.
  const nodeIndexForBlock = new Map<number, number>();

  // Build the file's skeleton (if any) once as document nodes: a skeleton-group node + joint nodes with
  // their bind-pose local transforms, and one skin entry whose joints are those node indices. AWD binds a
  // mesh to a skeleton through an animator block Flight does not parse yet; with the common single-skeleton
  // file (the shambler) every skinned mesh is bound to that one skeleton.
  let skinIndex: number | undefined;
  let skeletonJointNodeIndices: number[] = [];
  if (skeletonBlocks.size > 0) {
    const built = buildAwdSkeletonDocument(skeletonBlocks.values().next().value!, document);
    skeletonJointNodeIndices = built.jointNodeIndices;
    skinIndex = document.skins.length;
    document.skins.push(built.skin);
    document.scenes[0].rootNodes.push(built.skeletonRootIndex);
    if (skeletonBlocks.size > 1) {
      warnings?.push(
        `createSceneFromAwd2: file has ${skeletonBlocks.size} skeletons; every skinned mesh binds to the first`,
      );
    }
  }

  for (const [blockId, container] of containerBlocks) {
    const nodeIndex = document.nodes.length;
    document.nodes.push({
      children: [],
      kind: SceneNodeKind,
      name: container.name || undefined,
      transform: awdTransformToTransform3D(container.transform),
    });
    nodeIndexForBlock.set(blockId, nodeIndex);
  }

  // One Flight Material per AWD material block, shared across every subset that references it (and thus one
  // Texture + one ImageResource per shared texture). Keyed by AWD material block id → document material index.
  const resolvedMaterials = new Map<number, number>();
  const materialForSubset = (meshInst: ParsedMeshInstance, subsetIndex: number): number[] => {
    const materialId = subsetIndex < meshInst.materialIds.length ? meshInst.materialIds[subsetIndex] : 0;
    const index = resolveAwdMaterial(materialId, materialBlocks, textureBlocks, resolvedMaterials, document, warnings);
    return index >= 0 ? [index] : [];
  };

  for (const [blockId, meshInst] of meshInstanceBlocks) {
    const geometries = geometryBlocks.get(meshInst.geometryId);
    const transform = awdTransformToTransform3D(meshInst.transform);
    let nodeIndex: number;
    if (geometries !== undefined && geometries.length > 0) {
      if (geometries.length === 1) {
        // The single mesh node carries the instance name directly; the multi-geometry branch instead names
        // the wrapping group (its subset meshes stay anonymous parts).
        const meshIndex = document.meshes.length;
        const mesh: SceneDocumentMesh = {
          geometry: geometries[0].geometry,
          materials: materialForSubset(meshInst, 0),
        };
        if (skinIndex !== undefined && geometries[0].skinned) mesh.skin = skinIndex;
        document.meshes.push(mesh);
        nodeIndex = document.nodes.length;
        document.nodes.push({
          children: [],
          kind: MeshKind,
          mesh: meshIndex,
          name: meshInst.name || undefined,
          transform,
        });
      } else {
        nodeIndex = document.nodes.length;
        const group: SceneDocumentNode = {
          children: [],
          kind: SceneNodeKind,
          name: meshInst.name || undefined,
          transform,
        };
        document.nodes.push(group);
        for (let i = 0; i < geometries.length; i++) {
          const meshIndex = document.meshes.length;
          const mesh: SceneDocumentMesh = {
            geometry: geometries[i].geometry,
            materials: materialForSubset(meshInst, i),
          };
          if (skinIndex !== undefined && geometries[i].skinned) mesh.skin = skinIndex;
          document.meshes.push(mesh);
          const childIndex = document.nodes.length;
          document.nodes.push({ children: [], kind: MeshKind, mesh: meshIndex, transform: createTransform3D() });
          group.children.push(childIndex);
        }
      }
    } else {
      nodeIndex = document.nodes.length;
      document.nodes.push({ children: [], kind: SceneNodeKind, name: meshInst.name || undefined, transform });
      if (meshInst.geometryId !== 0) {
        warnings?.push(
          `createSceneFromAwd2: mesh instance block ${blockId} references geometry block ${meshInst.geometryId} which was not found`,
        );
      }
    }
    nodeIndexForBlock.set(blockId, nodeIndex);
  }

  const parented = new Set<number>();
  for (const [blockId, container] of containerBlocks) {
    if (container.parentId !== 0) {
      const parentIndex = nodeIndexForBlock.get(container.parentId);
      if (parentIndex !== undefined) {
        document.nodes[parentIndex].children.push(nodeIndexForBlock.get(blockId)!);
        parented.add(blockId);
      }
    }
  }
  for (const [blockId, meshInst] of meshInstanceBlocks) {
    if (meshInst.parentId !== 0) {
      const parentIndex = nodeIndexForBlock.get(meshInst.parentId);
      if (parentIndex !== undefined) {
        document.nodes[parentIndex].children.push(nodeIndexForBlock.get(blockId)!);
        parented.add(blockId);
      }
    }
  }

  for (const blockId of nodeIndexForBlock.keys()) {
    if (!parented.has(blockId)) document.scenes[0].rootNodes.push(nodeIndexForBlock.get(blockId)!);
  }

  // The file's skeleton animations become document animations whose channels bind by joint node index. Uses
  // the same block-walk as the live parseAwd2SkeletonAnimations, but emits node-index-bound document channels.
  // Walks the rehydrated `source` (not the original `bytes`): a compressed file — Away3D's export default —
  // still has a deflated body in `bytes`, so re-walking that would find no blocks and silently drop every
  // animation. `source` is already inflated with the compression byte + body-length rewritten by rehydrate.
  if (skeletonJointNodeIndices.length > 0) {
    document.animations.push(...buildAwdDocumentAnimations(source, skeletonJointNodeIndices, warnings));
  }

  return document;
}

// Parses every named skeleton-animation block in an AWD file into a name→clip map. Each clip drives the
// given joint SceneNodes — the joints createSceneFromAwd2 built and exposed as mesh.skin.skeleton.joints —
// so binding to those same nodes (rather than freshly-created ones) is what lets a clip deform the skinned
// mesh: animation, skeleton, and skin all reference one joint hierarchy. Mirrors parseMd5Anim(source,
// joints). A file may carry several named animations (idle/walk/attack); each is keyed by its block name
// (or `animation${i}` in file order when unnamed), so a caller selects one with `clips['walk']`. Returns
// an empty map when the header is invalid or no skeleton/animation blocks are found. The `joints` array
// must be in AWD skeleton order (index j = joint j); a length mismatch with the file's skeleton warns.
export function parseAwd2SkeletonAnimations(
  bytes: Readonly<Uint8Array>,
  joints: readonly SceneNode[],
  warnings?: string[],
): Record<string, AnimationClip> {
  const input = bytes as Uint8Array;
  if (input.byteLength < AWD2_HEADER_BYTES) {
    warnings?.push('parseAwd2SkeletonAnimations: byte length is smaller than the 12-byte AWD header');
    return {};
  }

  if (input[0] !== AWD2_MAGIC_0 || input[1] !== AWD2_MAGIC_1 || input[2] !== AWD2_MAGIC_2) {
    warnings?.push("parseAwd2SkeletonAnimations: magic is not 'AWD'; not an AWD file");
    return {};
  }

  if (!isAwd2Version(input, 'parseAwd2SkeletonAnimations', warnings)) return {};

  // Inflate a compressed body and splice it back behind the header so the walk is identical to the
  // uncompressed path; bails to an empty result when no codec is registered for the compression method.
  const rehydrated = rehydrateAwdBody(input, 'parseAwd2SkeletonAnimations', warnings);
  if (rehydrated === null) return {};
  const source = rehydrated.source;
  const view = rehydrated.view;

  const bodyLength = view.getUint32(8, true);
  const bodyEnd = Math.min(AWD2_HEADER_BYTES + bodyLength, source.byteLength);

  const skeletonBlocks = new Map<number, ParsedSkeleton>();
  const poseBlocks = new Map<number, ParsedSkeletonPose>();
  const animationBlocks = new Map<number, ParsedSkeletonAnimation>();

  let offset = AWD2_HEADER_BYTES;
  while (offset + AWD2_BLOCK_HEADER_BYTES <= bodyEnd) {
    const blockId = view.getUint32(offset, true);
    const namespace = source[offset + 4];
    const blockType = source[offset + 5];
    const blockFlags = source[offset + 6];
    const blockLength = view.getUint32(offset + 7, true);
    const blockDataStart = offset + AWD2_BLOCK_HEADER_BYTES;

    if (blockDataStart + blockLength > bodyEnd) {
      warnings?.push('parseAwd2SkeletonAnimations: block length runs past the end of the body');
      break;
    }

    const matrixWide = (blockFlags & 1) !== 0;

    if (namespace === AWD2_NAMESPACE_CORE) {
      if (blockType === AWD2_BLOCK_SKELETON) {
        const skeleton = parseSkeletonBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          warnings,
        );
        if (skeleton !== null) skeletonBlocks.set(blockId, skeleton);
      } else if (blockType === AWD2_BLOCK_SKELETON_POSE) {
        const pose = parseSkeletonPoseBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          warnings,
        );
        if (pose !== null) poseBlocks.set(blockId, pose);
      } else if (blockType === AWD2_BLOCK_SKELETON_ANIMATION) {
        const anim = parseSkeletonAnimationBlock(view, source, blockDataStart, blockDataStart + blockLength, warnings);
        if (anim !== null) animationBlocks.set(blockId, anim);
      }
    }

    offset = blockDataStart + blockLength;
  }

  if (skeletonBlocks.size === 0) {
    warnings?.push('parseAwd2SkeletonAnimations: no skeleton blocks found');
    return {};
  }
  if (animationBlocks.size === 0) {
    warnings?.push('parseAwd2SkeletonAnimations: no skeleton animation blocks found');
    return {};
  }

  const parsedSkeleton = skeletonBlocks.values().next().value!;
  if (joints.length < parsedSkeleton.joints.length) {
    warnings?.push(
      `parseAwd2SkeletonAnimations: joints array has ${joints.length} nodes but skeleton has ${parsedSkeleton.joints.length} joints`,
    );
    return {};
  }

  // A file can carry several named animations (idle/walk/attack); build a clip for each and key it by the
  // block's name (falling back to file order when unnamed). All bind to the one shared joint hierarchy.
  const out: Record<string, AnimationClip> = {};
  let index = 0;
  for (const parsedAnimation of animationBlocks.values()) {
    const clip = buildAwdSkeletonAnimationClip(
      parsedAnimation,
      parsedSkeleton.joints.length,
      poseBlocks,
      joints,
      warnings,
    );
    if (clip !== null) out[parsedAnimation.name || `animation${index}`] = clip;
    index++;
  }
  return out;
}

// Registers a decompressor for an AWD compression method (AWD2_COMPRESSION_DEFLATE / _LZMA), enabling
// `parseAwd2`/`parseAwd2SkeletonAnimations` to import compressed files. Kept as an opt-in registry so the
// codec stays tree-shakable — a bundle that only reads uncompressed AWD never pulls an inflate into its
// output. Last registration for a method wins; passing null clears it. Codecs are keyed by the header's
// compression byte, so a vendor can supply its own (e.g. a host-native inflate) for either method.
export function registerAwd2Decompressor(compression: number, decompressor: AwdDecompressor | null): void {
  if (decompressor === null) awdDecompressors.delete(compression);
  else awdDecompressors.set(compression, decompressor);
}

// Builds one AnimationClip from a parsed AWD skeleton-animation block: samples each pose's per-joint local
// matrix into a translation + rotation track bound to the matching joint node. Null when it has no poses.
function buildAwdSkeletonAnimationClip(
  parsedAnimation: Readonly<ParsedSkeletonAnimation>,
  jointCount: number,
  poseBlocks: ReadonlyMap<number, ParsedSkeletonPose>,
  joints: readonly SceneNode[],
  warnings?: string[],
): AnimationClip | null {
  const poseCount = parsedAnimation.poses.length;
  if (poseCount === 0) {
    warnings?.push('parseAwd2SkeletonAnimations: skeleton animation has no poses');
    return null;
  }

  const times: number[] = [];
  let timeAccumulator = 0;
  for (let p = 0; p < poseCount; p++) {
    times.push(timeAccumulator);
    timeAccumulator += parsedAnimation.poses[p].duration / 1000;
  }

  // Each AWD pose carries a full local joint matrix (rotation + translation). A skeletal animation is
  // driven mostly by joint rotation; emitting only translation leaves every joint at its bind-pose
  // orientation, which compounds down the chain into a wildly deformed mesh. So decompose each pose's
  // 3×3 into a quaternion and drive both the joint's rotation and translation.
  const poseMatrix = createMatrix4();
  const poseTransform = createTransform3D();
  const channels = [];
  for (let j = 0; j < jointCount; j++) {
    const translationValues: number[] = [];
    const rotationValues: number[] = [];
    const scaleValues: number[] = [];
    let hasScale = false;
    for (let p = 0; p < poseCount; p++) {
      const poseBlockId = parsedAnimation.poses[p].poseBlockId;
      const pose = poseBlocks.get(poseBlockId);
      if (pose === undefined) {
        warnings?.push(
          `parseAwd2SkeletonAnimations: pose block ${poseBlockId} referenced by animation not found; using identity`,
        );
        translationValues.push(0, 0, 0);
        rotationValues.push(0, 0, 0, 1);
        scaleValues.push(1, 1, 1);
      } else if (j < pose.jointTransforms.length && pose.jointTransforms[j] !== null) {
        const transform = pose.jointTransforms[j]!;
        translationValues.push(transform[9], transform[10], transform[11]);
        // Decompose the pose's 3×3 basis into rotation AND scale. A plain setQuaternionFromMatrix4 would
        // read a skewed quaternion off a scaled basis and drop the scale entirely; decompose normalizes
        // the basis first, so both come out correct. The lifted matrix's translation is unused here.
        awdTransformToMatrix4(poseMatrix, transform);
        decomposeMatrix4ToTransform3D(poseTransform, poseMatrix);
        rotationValues.push(
          poseTransform.rotation.x,
          poseTransform.rotation.y,
          poseTransform.rotation.z,
          poseTransform.rotation.w,
        );
        scaleValues.push(poseTransform.scale.x, poseTransform.scale.y, poseTransform.scale.z);
        if (hasNonUnitScale(poseTransform.scale.x, poseTransform.scale.y, poseTransform.scale.z)) hasScale = true;
      } else {
        translationValues.push(0, 0, 0);
        rotationValues.push(0, 0, 0, 1);
        scaleValues.push(1, 1, 1);
      }
    }

    const translationTrack = createAnimationTrack({
      components: 3,
      times,
      values: translationValues,
    });
    channels.push(createAnimationChannel(translationTrack, { node: joints[j], path: SceneAnimationPathTranslation }));

    const rotationTrack = createAnimationTrack({
      components: 4,
      quaternion: true,
      times,
      values: rotationValues,
    });
    channels.push(createAnimationChannel(rotationTrack, { node: joints[j], path: SceneAnimationPathRotation }));

    // Only emit a scale track when some pose actually scales the joint — AWD skeletons rarely do, and a
    // redundant unit-scale channel would bloat every clip.
    if (hasScale) {
      const scaleTrack = createAnimationTrack({ components: 3, times, values: scaleValues });
      channels.push(createAnimationChannel(scaleTrack, { node: joints[j], path: SceneAnimationPathScale }));
    }
  }

  return createAnimationClip(channels, timeAccumulator);
}

// Builds the document animation table from an AWD file's skeleton-animation blocks, binding each channel by
// the joint's document node index (in `jointNodeIndices`, AWD joint order). The block walk mirrors the live
// parseAwd2SkeletonAnimations; the difference is only the sink — document channels carry a node index + path
// + track rather than a live-node-bound AnimationChannel. Every named animation (idle/walk/attack) becomes
// one SceneDocumentAnimation keyed by its block name (or `animation${i}` in file order when unnamed). Returns
// an empty array when no skeleton/animation blocks are found. `bytes` must be the REHYDRATED body (compression
// byte NONE, inflated), not the raw file — this helper does not decompress, unlike parseAwd2SkeletonAnimations.
function buildAwdDocumentAnimations(
  bytes: Readonly<Uint8Array>,
  jointNodeIndices: readonly number[],
  warnings?: string[],
): SceneDocumentAnimation[] {
  const source = bytes as Uint8Array;
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const bodyLength = view.getUint32(8, true);
  const bodyEnd = Math.min(AWD2_HEADER_BYTES + bodyLength, source.byteLength);

  const skeletonBlocks = new Map<number, ParsedSkeleton>();
  const poseBlocks = new Map<number, ParsedSkeletonPose>();
  const animationBlocks = new Map<number, ParsedSkeletonAnimation>();

  let offset = AWD2_HEADER_BYTES;
  while (offset + AWD2_BLOCK_HEADER_BYTES <= bodyEnd) {
    const namespace = source[offset + 4];
    const blockType = source[offset + 5];
    const blockFlags = source[offset + 6];
    const blockLength = view.getUint32(offset + 7, true);
    const blockDataStart = offset + AWD2_BLOCK_HEADER_BYTES;
    if (blockDataStart + blockLength > bodyEnd) break;
    const blockId = view.getUint32(offset, true);
    const matrixWide = (blockFlags & 1) !== 0;
    if (namespace === AWD2_NAMESPACE_CORE) {
      if (blockType === AWD2_BLOCK_SKELETON) {
        const skeleton = parseSkeletonBlock(view, source, blockDataStart, blockDataStart + blockLength, matrixWide);
        if (skeleton !== null) skeletonBlocks.set(blockId, skeleton);
      } else if (blockType === AWD2_BLOCK_SKELETON_POSE) {
        const pose = parseSkeletonPoseBlock(view, source, blockDataStart, blockDataStart + blockLength, matrixWide);
        if (pose !== null) poseBlocks.set(blockId, pose);
      } else if (blockType === AWD2_BLOCK_SKELETON_ANIMATION) {
        const anim = parseSkeletonAnimationBlock(view, source, blockDataStart, blockDataStart + blockLength);
        if (anim !== null) animationBlocks.set(blockId, anim);
      }
    }
    offset = blockDataStart + blockLength;
  }

  if (skeletonBlocks.size === 0 || animationBlocks.size === 0) return [];
  const parsedSkeleton = skeletonBlocks.values().next().value!;
  const jointCount = parsedSkeleton.joints.length;

  const animations: SceneDocumentAnimation[] = [];
  let index = 0;
  for (const parsedAnimation of animationBlocks.values()) {
    const built = buildAwdDocumentAnimation(parsedAnimation, jointCount, poseBlocks, jointNodeIndices, warnings);
    if (built !== null) {
      built.name = parsedAnimation.name || `animation${index}`;
      animations.push(built);
    }
    index++;
  }
  return animations;
}

// Builds one SceneDocumentAnimation from a parsed AWD skeleton-animation block: samples each pose's per-joint
// local matrix into a translation + rotation track bound to the matching joint node INDEX. Null when it has
// no poses. Mirrors buildAwdSkeletonAnimationClip's per-joint sampling, emitting document channels.
function buildAwdDocumentAnimation(
  parsedAnimation: Readonly<ParsedSkeletonAnimation>,
  jointCount: number,
  poseBlocks: ReadonlyMap<number, ParsedSkeletonPose>,
  jointNodeIndices: readonly number[],
  warnings?: string[],
): SceneDocumentAnimation | null {
  const poseCount = parsedAnimation.poses.length;
  if (poseCount === 0) {
    warnings?.push('parseAwd2SkeletonAnimations: skeleton animation has no poses');
    return null;
  }

  const times: number[] = [];
  let timeAccumulator = 0;
  for (let p = 0; p < poseCount; p++) {
    times.push(timeAccumulator);
    timeAccumulator += parsedAnimation.poses[p].duration / 1000;
  }

  const poseMatrix = createMatrix4();
  const poseTransform = createTransform3D();
  const channels: SceneDocumentAnimationChannel[] = [];
  for (let j = 0; j < jointCount; j++) {
    if (j >= jointNodeIndices.length) break;
    const translationValues: number[] = [];
    const rotationValues: number[] = [];
    const scaleValues: number[] = [];
    let hasScale = false;
    for (let p = 0; p < poseCount; p++) {
      const poseBlockId = parsedAnimation.poses[p].poseBlockId;
      const pose = poseBlocks.get(poseBlockId);
      if (pose === undefined) {
        warnings?.push(
          `parseAwd2SkeletonAnimations: pose block ${poseBlockId} referenced by animation not found; using identity`,
        );
        translationValues.push(0, 0, 0);
        rotationValues.push(0, 0, 0, 1);
        scaleValues.push(1, 1, 1);
      } else if (j < pose.jointTransforms.length && pose.jointTransforms[j] !== null) {
        const transform = pose.jointTransforms[j]!;
        translationValues.push(transform[9], transform[10], transform[11]);
        // Decompose rotation + scale from the pose basis (see the live-clip path for why decompose,
        // not setQuaternionFromMatrix4 alone).
        awdTransformToMatrix4(poseMatrix, transform);
        decomposeMatrix4ToTransform3D(poseTransform, poseMatrix);
        rotationValues.push(
          poseTransform.rotation.x,
          poseTransform.rotation.y,
          poseTransform.rotation.z,
          poseTransform.rotation.w,
        );
        scaleValues.push(poseTransform.scale.x, poseTransform.scale.y, poseTransform.scale.z);
        if (hasNonUnitScale(poseTransform.scale.x, poseTransform.scale.y, poseTransform.scale.z)) hasScale = true;
      } else {
        translationValues.push(0, 0, 0);
        rotationValues.push(0, 0, 0, 1);
        scaleValues.push(1, 1, 1);
      }
    }

    const translationTrack: AnimationTrack = createAnimationTrack({ components: 3, times, values: translationValues });
    channels.push({ node: jointNodeIndices[j], path: SceneAnimationPathTranslation, track: translationTrack });

    const rotationTrack: AnimationTrack = createAnimationTrack({
      components: 4,
      quaternion: true,
      times,
      values: rotationValues,
    });
    channels.push({ node: jointNodeIndices[j], path: SceneAnimationPathRotation, track: rotationTrack });

    if (hasScale) {
      const scaleTrack: AnimationTrack = createAnimationTrack({ components: 3, times, values: scaleValues });
      channels.push({ node: jointNodeIndices[j], path: SceneAnimationPathScale, track: scaleTrack });
    }
  }

  return { channels, duration: timeAccumulator, name: parsedAnimation.name };
}

// Validates the header version-major byte before the block walk. An 'AWD'-magic file with a version other
// than 2 (in practice version 3 — AWD3, AwayJS's SceneGraph format) has an entirely different block model,
// so the AWD2 block walk would silently misparse it to an empty/garbage document. Reject it by name here
// instead, pointing at AWD3 as a recognized but not-yet-implemented future format.
function isAwd2Version(input: Readonly<Uint8Array>, context: string, warnings?: string[]): boolean {
  const versionMajor = input[AWD2_VERSION_MAJOR_OFFSET];
  if (versionMajor === AWD2_FORMAT_VERSION) return true;
  warnings?.push(
    `${context}: AWD version ${versionMajor} is not supported — this importer reads AWD2 (version 2) only. ` +
      'Version 3 (AWD3, the AwayJS SceneGraph format) is a recognized but not-yet-implemented future format.',
  );
  return false;
}

// The empty SceneDocument returned when AWD parsing fails or before assembly begins — every table present.
function emptyAwdDocument(): SceneDocument {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [{ rootNodes: [] }],
    skins: [],
  };
}

// Emits an AWD skeleton block into a SceneDocument as a "skeleton" group node + one joint node per AWD
// joint (with its bind-pose local transform), plus a SceneDocumentSkin whose joints are those node indices
// and whose inverseBind are the AWD joint matrices (which ARE the inverse bind pose). Appends the nodes to
// `document.nodes` and returns the skeleton-group node index, the joint node indices (in AWD joint order,
// for animation binding), and the skin. The parent chain is wired through the joint nodes' `children` index
// lists (AWD parent index is 1-based, 0 = root; roots hang under the group). Each joint's LOCAL transform
// is seeded to the bind pose so the skinned mesh renders undeformed until the animation poses the joints —
// the same math the live scene path used, decomposed to a Transform3D for the document node.
function buildAwdSkeletonDocument(
  parsedSkeleton: Readonly<ParsedSkeleton>,
  document: SceneDocument,
): { jointNodeIndices: number[]; skeletonRootIndex: number; skin: SceneDocumentSkin } {
  const jointCount = parsedSkeleton.joints.length;

  const skeletonRootIndex = document.nodes.length;
  document.nodes.push({ children: [], kind: SceneNodeKind, name: 'skeleton', transform: createTransform3D() });

  const jointNodeIndices: number[] = [];
  for (let j = 0; j < jointCount; j++) {
    jointNodeIndices.push(document.nodes.length);
    document.nodes.push({
      children: [],
      kind: SceneNodeKind,
      name: parsedSkeleton.joints[j].name || undefined,
      transform: createTransform3D(),
    });
  }

  for (let j = 0; j < jointCount; j++) {
    const parentIndex1 = parsedSkeleton.joints[j].parentIndex;
    if (parentIndex1 > 0 && parentIndex1 - 1 < jointCount) {
      document.nodes[jointNodeIndices[parentIndex1 - 1]].children.push(jointNodeIndices[j]);
    } else {
      document.nodes[skeletonRootIndex].children.push(jointNodeIndices[j]);
    }
  }

  // The AWD skeleton joint matrix is the joint's INVERSE bind pose (model→joint at bind), not a local
  // transform — see the AWD format and AwayJS's AWDParser (joint.inverseBindPose). So carry it as the skin's
  // explicit inverse-bind palette, and seed each joint's LOCAL transform to the bind pose so the rig renders
  // undeformed until the animation poses the joints. Bind world = inverseBind⁻¹, and a joint's bind-local =
  // parentBindWorld⁻¹ · jointBindWorld (roots use bind world directly). The animation clip then overrides
  // these locals per frame; the skinning palette is jointWorld · inverseBind, which is identity at bind
  // (undeformed) and the pose delta once animated.
  const inverseBind: Matrix4[] = [];
  const bindWorld: Matrix4[] = [];
  for (let j = 0; j < jointCount; j++) {
    const invBind = createMatrix4();
    awdTransformToMatrix4(invBind, parsedSkeleton.joints[j].transform);
    inverseBind.push(invBind);
    const bw = createMatrix4();
    inverseMatrix4(bw, invBind);
    bindWorld.push(bw);
  }

  const invParent = createMatrix4();
  const local = createMatrix4();
  for (let j = 0; j < jointCount; j++) {
    const parentIndex1 = parsedSkeleton.joints[j].parentIndex;
    if (parentIndex1 > 0 && parentIndex1 - 1 < jointCount) {
      inverseMatrix4(invParent, bindWorld[parentIndex1 - 1]);
      multiplyMatrix4(local, invParent, bindWorld[j]);
    } else {
      copyMatrix4(local, bindWorld[j]);
    }
    decomposeMatrix4ToTransform3D(document.nodes[jointNodeIndices[j]].transform, local);
  }

  const skin: SceneDocumentSkin = { inverseBind, joints: jointNodeIndices };
  return { jointNodeIndices, skeletonRootIndex, skin };
}

interface ParsedGeometry {
  geometry: ReturnType<typeof createMeshGeometry>;
  // True when the sub-mesh carried joint-index/weight streams and emitted the skinned layout, so the
  // mesh-instance pass knows to bind the file's skeleton to the produced Mesh via mesh.skin.
  skinned: boolean;
}

interface ParsedContainer {
  name: string;
  parentId: number;
  transform: Float64Array;
}

interface ParsedMeshInstance {
  geometryId: number;
  materialIds: number[];
  name: string;
  parentId: number;
  transform: Float64Array;
}

// A parsed AWD material block (type 81). `diffuseTextureId`/`normalTextureId` are texture block ids (0 =
// absent), `color`/`alpha` the diffuse base (null = absent). `numMethods` is the declared shading-method
// count — the method bodies are not walked yet (resolveAwdMaterial warns when > 0). Other base flags
// (smoothing/repeat/mipmap) are parsed past but not mapped.
interface ParsedMaterial {
  alpha: number | null;
  color: number | null;
  diffuseTextureId: number;
  name: string;
  normalTextureId: number;
  numMethods: number;
}

// A parsed AWD texture block (type 82). Exactly one source form is populated: `bytes` (+ detected
// `mimeType`) for an embedded, self-describing image payload (PNG/JPEG/…), or `url` for an external
// reference (the block's name is the URL in AWD's external form). Both null when an embedded payload
// was not a recognized image format (dropped). The parser emits these as a ImageResourceReference; it does
// not fetch or decode.
interface ParsedTexture {
  bytes: Uint8Array | null;
  mimeType: string | null;
  name: string;
  url: string | null;
}

function readAwdString(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  offset: number,
): { end: number; value: string } {
  const length = (view as DataView).getUint16(offset, true);
  const stringBytes = (source as Uint8Array).subarray(offset + 2, offset + 2 + length);
  const value = new TextDecoder().decode(stringBytes);
  return { end: offset + 2 + length, value };
}

function readAwdTransform(
  view: Readonly<DataView>,
  offset: number,
  widePrecision: boolean,
): { end: number; transform: Float64Array } {
  const dv = view as DataView;
  const transform = new Float64Array(12);
  const floatSize = widePrecision ? 8 : 4;
  for (let i = 0; i < 12; i++) {
    transform[i] = widePrecision
      ? dv.getFloat64(offset + i * floatSize, true)
      : dv.getFloat32(offset + i * floatSize, true);
  }
  convertTransformLhToRh(transform);
  return { end: offset + 12 * floatSize, transform };
}

// Decomposes an AWD 12-float column-major transform into a document node's authored TRS Transform3D
// (lossy only on shear, which AWD authoring does not produce).
function awdTransformToTransform3D(transform: Readonly<Float64Array>): Transform3D {
  awdTransformToMatrix4(_awdTransformScratch, transform);
  const out = createTransform3D();
  decomposeMatrix4ToTransform3D(out, _awdTransformScratch);
  return out;
}

const _awdTransformScratch = createMatrix4();

// AWD stores transforms as 12 column-major floats: [c0x,c0y,c0z, c1x,c1y,c1z, c2x,c2y,c2z, tx,ty,tz] →
// 4×4 column-major with w-column [0,0,0,1]. Lifts one into `out` (its runtime binding is left intact).
function awdTransformToMatrix4(out: Matrix4, transform: Readonly<Float64Array>): void {
  const m = out.m;
  m[0] = transform[0];
  m[1] = transform[1];
  m[2] = transform[2];
  m[3] = 0;
  m[4] = transform[3];
  m[5] = transform[4];
  m[6] = transform[5];
  m[7] = 0;
  m[8] = transform[6];
  m[9] = transform[7];
  m[10] = transform[8];
  m[11] = 0;
  m[12] = transform[9];
  m[13] = transform[10];
  m[14] = transform[11];
  m[15] = 1;
}

function awdDataTypeByteSize(dataType: number): number {
  switch (dataType) {
    case AWD2_DATA_INT8:
    case AWD2_DATA_UINT8:
      return 1;
    case AWD2_DATA_INT16:
    case AWD2_DATA_UINT16:
      return 2;
    case AWD2_DATA_INT32:
    case AWD2_DATA_UINT32:
    case AWD2_DATA_FLOAT32:
      return 4;
    case AWD2_DATA_FLOAT64:
      return 8;
    default:
      return 4;
  }
}

function readAwdDataValue(view: Readonly<DataView>, offset: number, dataType: number): number {
  const dv = view as DataView;
  switch (dataType) {
    case AWD2_DATA_INT8:
      return dv.getInt8(offset);
    case AWD2_DATA_INT16:
      return dv.getInt16(offset, true);
    case AWD2_DATA_INT32:
      return dv.getInt32(offset, true);
    case AWD2_DATA_UINT8:
      return dv.getUint8(offset);
    case AWD2_DATA_UINT16:
      return dv.getUint16(offset, true);
    case AWD2_DATA_UINT32:
      return dv.getUint32(offset, true);
    case AWD2_DATA_FLOAT32:
      return dv.getFloat32(offset, true);
    case AWD2_DATA_FLOAT64:
      return dv.getFloat64(offset, true);
    default:
      return dv.getFloat32(offset, true);
  }
}

// Skips an AWD attribute list (NumAttrList or UserAttrList). The list is a uint32 byte-length
// prefix followed by that many bytes of attribute data.
function skipAwdAttrList(view: Readonly<DataView>, offset: number, end: number): number {
  if (offset + 4 > end) return offset;
  const byteLength = (view as DataView).getUint32(offset, true);
  return offset + 4 + byteLength;
}

// Parses a TriangleGeometry block (type 1). Layout:
// name(VarString) → numSubMeshes(uint16) → NumAttrList → per sub-mesh:
//   totalByteLen(uint32) → NumAttrList → streams → UserAttrList
function parseTriangleGeometryBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  geometryWide: boolean,
  warnings?: string[],
): ParsedGeometry[] {
  const dv = view as DataView;
  let offset = start;

  if (offset + 2 > end) return [];
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) return [];
  const numSubMeshes = dv.getUint16(offset, true);
  offset += 2;

  offset = skipAwdAttrList(view, offset, end);

  const geometries: ParsedGeometry[] = [];

  for (let s = 0; s < numSubMeshes; s++) {
    if (offset + 4 > end) break;
    const subMeshByteLen = dv.getUint32(offset, true);
    const subMeshEnd = offset + 4 + subMeshByteLen;
    offset += 4;

    // NumAttrList for sub-mesh properties.
    offset = skipAwdAttrList(view, offset, end);

    let positions: number[] | null = null;
    let indices: number[] | null = null;
    let uvs: number[] | null = null;
    let normals: number[] | null = null;
    let tangents: number[] | null = null;
    let jointIndices: number[] | null = null;
    let jointWeights: number[] | null = null;

    // Read streams until we reach the sub-mesh byte boundary (leaving room for UserAttrList).
    while (offset + 6 <= subMeshEnd) {
      const streamType = dv.getUint8(offset);
      offset += 1;
      const dataType = dv.getUint8(offset);
      offset += 1;
      const streamByteLength = dv.getUint32(offset, true);
      offset += 4;

      if (offset + streamByteLength > end) {
        warnings?.push('createSceneFromAwd2: stream data runs past the end of the block');
        break;
      }

      // AWD stores per-vertex joint indices as uint16 (Away3D reads them with readUnsignedShort),
      // regardless of the stream's declared data type — exporters write float32 in that field but
      // pack the payload as tight uint16 indices. Read them as uint16 by byte length; the paired
      // weight stream is genuine float32 and goes through the generic reader below.
      if (streamType === AWD2_STREAM_JOINT_INDICES) {
        const jointCount = Math.floor(streamByteLength / 2);
        const values: number[] = [];
        for (let i = 0; i < jointCount; i++) values.push(dv.getUint16(offset + i * 2, true));
        jointIndices = values;
        offset += streamByteLength;
        continue;
      }

      const elementSize = awdDataTypeByteSize(dataType);
      const count = Math.floor(streamByteLength / elementSize);

      const values: number[] = [];
      for (let i = 0; i < count; i++) {
        values.push(readAwdDataValue(view, offset + i * elementSize, dataType));
      }
      offset += streamByteLength;

      switch (streamType) {
        case AWD2_STREAM_POSITIONS:
          positions = values;
          break;
        case AWD2_STREAM_INDICES:
          indices = values;
          break;
        case AWD2_STREAM_UVS:
          uvs = values;
          break;
        case AWD2_STREAM_NORMALS:
          normals = values;
          break;
        case AWD2_STREAM_TANGENTS:
          tangents = values;
          break;
        case AWD2_STREAM_JOINT_WEIGHTS:
          jointWeights = values;
          break;
        default:
          break;
      }
    }

    // UserAttrList for sub-mesh.
    offset = skipAwdAttrList(view, offset, end);

    if (positions === null || positions.length < 3) {
      warnings?.push('createSceneFromAwd2: sub-mesh has no positions or fewer than 3 position values');
      continue;
    }

    // Convert from AWD's left-handed Y-up to Flight's right-handed Y-up. Joint indices/weights are
    // index/scalar data — unaffected by the handedness flip, which the skeleton transforms mirror.
    negateVec3Z(positions);
    if (normals !== null) negateVec3Z(normals);
    if (tangents !== null) negateVec3Z(tangents);
    if (indices !== null) reverseTriangleWinding(indices);

    const vertexCount = positions.length / 3;

    // A sub-mesh is skinned when it carries both influence streams; it then emits the skinned layout
    // (joints0/weights0 past uv0) and feeds the shared packSkinInfluences path. AWD lists an arbitrary
    // number of influences per vertex (shambler uses 8); the top four by weight are kept, renormalized.
    let jointsPerVertex = 0;
    if (jointIndices !== null && jointWeights !== null && vertexCount > 0) {
      jointsPerVertex = Math.floor(jointWeights.length / vertexCount);
      if (jointsPerVertex < 1 || jointIndices.length < vertexCount * jointsPerVertex) {
        warnings?.push('createSceneFromAwd2: skin streams do not match vertex count; sub-mesh imported without skin');
        jointsPerVertex = 0;
      }
    }
    const skinned = jointsPerVertex > 0;

    const floatsPerVertex = skinned ? SKINNED_FLOATS_PER_VERTEX : CANONICAL_FLOATS_PER_VERTEX;
    const vertices = new Float32Array(vertexCount * floatsPerVertex);
    const jointScratch = [0, 0, 0, 0];
    const weightScratch = [0, 0, 0, 0];

    for (let v = 0; v < vertexCount; v++) {
      const o = v * floatsPerVertex;
      vertices[o] = positions[v * 3];
      vertices[o + 1] = positions[v * 3 + 1];
      vertices[o + 2] = positions[v * 3 + 2];

      if (normals !== null && v * 3 + 2 < normals.length) {
        vertices[o + 3] = normals[v * 3];
        vertices[o + 4] = normals[v * 3 + 1];
        vertices[o + 5] = normals[v * 3 + 2];
      }

      if (tangents !== null && v * 3 + 2 < tangents.length) {
        vertices[o + 6] = tangents[v * 3];
        vertices[o + 7] = tangents[v * 3 + 1];
        vertices[o + 8] = tangents[v * 3 + 2];
        // Tangent W is the bitangent handedness the shader reconstructs the bitangent with (B = W·N×T).
        // AWD's tangent stream is xyz only, so W must be synthesized: Away3D derives the bitangent as
        // N×T in its LEFT-handed space (one handedness for the whole mesh), and the left→right-handed
        // conversion above (negateVec3Z on N and T is a det=-1 reflection) flips that handedness. So the
        // correct sign in Flight's right-handed space is AWD2_TANGENT_HANDEDNESS. Left 0 (no bitangent) for
        // a vertex the tangent stream does not cover.
        vertices[o + 9] = AWD2_TANGENT_HANDEDNESS;
      }

      if (uvs !== null && v * 2 + 1 < uvs.length) {
        vertices[o + 10] = uvs[v * 2];
        vertices[o + 11] = uvs[v * 2 + 1];
      }

      if (skinned) {
        const influences: SkinInfluence[] = [];
        for (let k = 0; k < jointsPerVertex; k++) {
          const weight = jointWeights![v * jointsPerVertex + k];
          if (weight > 0) influences.push({ jointIndex: jointIndices![v * jointsPerVertex + k], weight });
        }
        packSkinInfluences(influences, jointScratch, weightScratch);
        vertices[o + 12] = jointScratch[0];
        vertices[o + 13] = jointScratch[1];
        vertices[o + 14] = jointScratch[2];
        vertices[o + 15] = jointScratch[3];
        vertices[o + 16] = weightScratch[0];
        vertices[o + 17] = weightScratch[1];
        vertices[o + 18] = weightScratch[2];
        vertices[o + 19] = weightScratch[3];
      }
    }

    const indexArray = indices !== null ? Uint32Array.from(indices) : undefined;
    const geometry = createMeshGeometry({
      indices: indexArray,
      layout: skinned ? CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT : CANONICAL_LAYOUT,
      vertices,
    });
    // Regenerate normals only when the sub-mesh carried none, matching the shared emitter; authored
    // AWD normals (present on skinned models like the shambler) are kept.
    if (normals === null && indexArray !== undefined) computeMeshGeometryNormals(geometry, geometry);
    // Away3D commonly ships meshes with UVs but NO tangent stream and derives tangents at load time. With
    // no stream the tangent frame above is left zero, so a normal-mapped material renders black (its
    // sampled normal has no basis to transform through). Synthesize a tangent basis (xyz + handedness W)
    // from positions/normals/UVs — the -1 W this yields for real AWD geometry is render-confirmed correct.
    // Only when the stream is absent and there are UVs (and indices, for the per-triangle UV gradient);
    // an authored tangent stream is kept untouched.
    if (tangents === null && uvs !== null && indexArray !== undefined) {
      computeMeshGeometryTangents(geometry, geometry);
    }
    geometries.push({ geometry, skinned });
  }

  return geometries;
}

// Parses a Container block (type 22). AWD SceneHeader layout:
// parentId(uint32) → matrix4x3(12 × floatSize) → name(VarString) → NumAttrList → UserAttrList
function parseContainerBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  matrixWide: boolean,
  warnings?: string[],
): ParsedContainer | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 4 > end) {
    warnings?.push('createSceneFromAwd2: container block truncated before parent ID');
    return null;
  }
  const parentId = dv.getUint32(offset, true);
  offset += 4;

  const floatSize = matrixWide ? 8 : 4;
  if (offset + 12 * floatSize > end) {
    warnings?.push('createSceneFromAwd2: container block truncated before transform');
    return null;
  }
  const transformResult = readAwdTransform(view, offset, matrixWide);
  offset = transformResult.end;

  if (offset + 2 > end) {
    warnings?.push('createSceneFromAwd2: container block truncated before name');
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  offset = skipAwdAttrList(view, offset, end);
  offset = skipAwdAttrList(view, offset, end);

  return { name: nameResult.value, parentId, transform: transformResult.transform };
}

// Parses a MeshInstance block (type 23). Layout:
// SceneHeader(parentId → matrix → name) → geometryId(uint32)
// → numMaterials(uint16) → materialIds(uint32 × N) → NumAttrList → UserAttrList
function parseMeshInstanceBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  matrixWide: boolean,
  warnings?: string[],
): ParsedMeshInstance | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 4 > end) {
    warnings?.push('createSceneFromAwd2: mesh instance block truncated before parent ID');
    return null;
  }
  const parentId = dv.getUint32(offset, true);
  offset += 4;

  const floatSize = matrixWide ? 8 : 4;
  if (offset + 12 * floatSize > end) {
    warnings?.push('createSceneFromAwd2: mesh instance block truncated before transform');
    return null;
  }
  const transformResult = readAwdTransform(view, offset, matrixWide);
  offset = transformResult.end;

  if (offset + 2 > end) {
    warnings?.push('createSceneFromAwd2: mesh instance block truncated before name');
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 4 > end) {
    warnings?.push('createSceneFromAwd2: mesh instance block truncated before geometry ID');
    return null;
  }
  const geometryId = dv.getUint32(offset, true);
  offset += 4;

  // Material block ids, positional per geometry sub-mesh. Previously read-and-discarded; kept now so
  // the diffuse material/texture for each subset can be resolved and attached.
  const materialIds: number[] = [];
  if (offset + 2 <= end) {
    const numMaterials = dv.getUint16(offset, true);
    offset += 2;
    for (let i = 0; i < numMaterials && offset + 4 <= end; i++) {
      materialIds.push(dv.getUint32(offset, true));
      offset += 4;
    }
  }

  // NumAttrList (block properties) and UserAttrList.
  offset = skipAwdAttrList(view, offset, end);
  offset = skipAwdAttrList(view, offset, end);

  return { geometryId, materialIds, name: nameResult.value, parentId, transform: transformResult.transform };
}

// Parses a Material block (type 81). Layout:
// name(VarString) → matType(uint8) → numMethods(uint8) → PropertyList → methods → UserAttrList.
// The base PropertyList carries the flat color (property 1), diffuse texture id (property 2), normal
// texture id (property 3), and alpha (property 10) — the properties Flight maps onto the ShadedMaterial
// base. `numMethods` is captured so the resolver can warn that a method-bearing material's shading methods
// (fog/env/fresnel/specular in Away3D's MethodMaterial model) are not yet imported as modifiers; the
// method bodies themselves (which follow the base PropertyList) are left unwalked pending a real
// method-bearing fixture and the verified AWD2 method-type layout — every AWD2 asset in the reference
// corpus is `numMethods == 0`, so there is nothing to observe or test the walk against yet.
function parseMaterialBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  warnings?: string[],
): ParsedMaterial | null {
  let offset = start;

  if (offset + 2 > end) {
    warnings?.push('createSceneFromAwd2: material block truncated before name');
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    warnings?.push(`createSceneFromAwd2: material '${nameResult.value}' truncated before type`);
    return null;
  }
  offset += 1; // matType (uint8) — texture vs color is inferred from which properties are present
  const numMethods = source[offset];
  offset += 1; // numMethods (uint8)

  const props = readAwdProperties(view, offset, end);
  const diffuseTextureId = readAwdPropertyUint32(view, props.values, AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE) ?? 0;
  const normalTextureId = readAwdPropertyUint32(view, props.values, AWD2_MATERIAL_PROP_NORMAL_TEXTURE) ?? 0;
  const color = readAwdPropertyUint32(view, props.values, AWD2_MATERIAL_PROP_COLOR);
  const alpha = readAwdPropertyFloat32(view, props.values, AWD2_MATERIAL_PROP_ALPHA);

  return { alpha, color, diffuseTextureId, name: nameResult.value, normalTextureId, numMethods };
}

// Parses a Texture block (type 82). Layout:
// name(VarString) → texType(uint8) → dataLen(uint32) → data(dataLen bytes) → PropertyList → UserAttrList.
// The embedded form carries a self-describing image payload (PNG/JPEG/…); the external form stores a
// URL Flight cannot fetch at parse time and is returned as an unresolved (byte-less) slot.
function parseTextureBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  warnings?: string[],
): ParsedTexture | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 2 > end) {
    warnings?.push('createSceneFromAwd2: texture block truncated before name');
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 5 > end) {
    warnings?.push(`createSceneFromAwd2: texture '${nameResult.value}' truncated before payload`);
    return null;
  }
  const texType = (source as Uint8Array)[offset];
  offset += 1;
  const dataLen = dv.getUint32(offset, true);
  offset += 4;

  if (offset + dataLen > end) {
    warnings?.push(
      `createSceneFromAwd2: texture '${nameResult.value}' declares ${dataLen} bytes but data is truncated`,
    );
    return null;
  }

  if (texType !== AWD2_TEXTURE_TYPE_EMBEDDED) {
    // AWD's external form carries the image URL as the block name; emit it as an External ref for
    // the resolver to fetch, rather than dropping it.
    return { bytes: null, mimeType: null, name: nameResult.value, url: nameResult.value };
  }

  const bytes = (source as Uint8Array).slice(offset, offset + dataLen);
  const mimeType = detectImageMimeType(bytes);
  if (mimeType === null) {
    warnings?.push(`createSceneFromAwd2: texture '${nameResult.value}' payload is not a recognized image format`);
    return { bytes: null, mimeType: null, name: nameResult.value, url: null };
  }

  return { bytes, mimeType, name: nameResult.value, url: null };
}

// Reads an AWD typed-property list: a uint32 byte-length prefix followed by `uint16 key, uint32
// fieldLength, <value>` records. Returns each key's value span so callers decode only the keys they
// know; unknown keys are stepped over by their length.
function readAwdProperties(
  view: Readonly<DataView>,
  offset: number,
  end: number,
): { end: number; values: Map<number, { length: number; offset: number }> } {
  const dv = view as DataView;
  const values = new Map<number, { length: number; offset: number }>();
  if (offset + 4 > end) return { end: offset, values };

  const listLength = dv.getUint32(offset, true);
  offset += 4;
  const listEnd = Math.min(offset + listLength, end);

  while (offset + 6 <= listEnd) {
    const key = dv.getUint16(offset, true);
    offset += 2;
    const fieldLength = dv.getUint32(offset, true);
    offset += 4;
    if (offset + fieldLength > listEnd) break;
    values.set(key, { length: fieldLength, offset });
    offset += fieldLength;
  }

  return { end: listEnd, values };
}

function readAwdPropertyFloat32(
  view: Readonly<DataView>,
  values: Readonly<Map<number, { length: number; offset: number }>>,
  key: number,
): number | null {
  const entry = values.get(key);
  if (entry === undefined || entry.length < 4) return null;
  return (view as DataView).getFloat32(entry.offset, true);
}

function readAwdPropertyUint32(
  view: Readonly<DataView>,
  values: Readonly<Map<number, { length: number; offset: number }>>,
  key: number,
): number | null {
  const entry = values.get(key);
  if (entry === undefined || entry.length < 4) return null;
  return (view as DataView).getUint32(entry.offset, true);
}

// Resolves an AWD material block id to a document material INDEX (appended to `document.materials`),
// memoized so a material shared by several subsets registers one entry (and one Texture/ImageResource per
// shared texture). Anything that resolves to no color and no textures returns -1 (a bare, unmaterialed
// subset — the assembler resolves an out-of-range index to null).
//
// AWD materials import as ShadedMaterial UNIFORMLY — including numMethods=0 (empty modifiers[]). AWD's
// material model is a MethodMaterial = a BlinnPhong base + a METHODS ARRAY; ShadedMaterial (base + an
// ordered modifiers[]) is its structural image. An empty stack honestly encodes a method-less material
// and compiles to the same base program as BlinnPhong (zero pixel cost), while (a) preserving losslessness
// if a file/exporter DOES carry methods, and (b) letting a demo author reproduce the original Away3D look
// by APPENDING a fresnel/fog modifier — no material-kind conversion. Do NOT collapse method-less materials
// to BlinnPhong: that discards the format's array-shaped intent to save a type. (Callers who genuinely want
// the leaner kind can down-convert a modifier-less ShadedMaterial to BlinnPhong themselves.)
//
// A method-bearing material (numMethods > 0) warns and imports its base only: the AWD2 method-block layout
// is unverified in-sandbox (the whole reference corpus is numMethods=0), so shipping a blind method→modifier
// walk would be speculative. The base carries color(1), diffuseTex(2), normalTex(3), alpha(10) — the only
// base properties real AWD2 files use; specular/gloss/ambient are METHODS in Away3D's model, not base props.
function resolveAwdMaterial(
  materialId: number,
  materialBlocks: Readonly<Map<number, ParsedMaterial>>,
  textureBlocks: Readonly<Map<number, ParsedTexture>>,
  cache: Map<number, number>,
  document: SceneDocument,
  warnings?: string[],
): number {
  if (materialId === 0) return -1;
  const cached = cache.get(materialId);
  if (cached !== undefined) return cached;

  const parsed = materialBlocks.get(materialId);
  if (parsed === undefined) {
    warnings?.push(`createSceneFromAwd2: mesh references material block ${materialId} which was not found`);
    cache.set(materialId, -1);
    return -1;
  }

  const diffuseTexture =
    parsed.diffuseTextureId !== 0
      ? resolveAwdTexture(parsed.diffuseTextureId, textureBlocks, document, warnings)
      : null;
  const normalTexture =
    parsed.normalTextureId !== 0 ? resolveAwdTexture(parsed.normalTextureId, textureBlocks, document, warnings) : null;
  if (diffuseTexture === null && normalTexture === null && parsed.color === null) {
    cache.set(materialId, -1);
    return -1;
  }

  // A method-bearing material imports its base only (see the header note) — warn rather than silently drop.
  if (parsed.numMethods > 0) {
    warnings?.push(
      `createSceneFromAwd2: material '${parsed.name || '(unnamed)'}' declares ${parsed.numMethods} shading ` +
        'method(s); AWD method→ShadedMaterial-modifier import is not yet implemented — importing the base material ' +
        'only (empty modifiers). Reproduce the original look by appending a modifier in the loading example.',
    );
  }

  const diffuse = getAwdDiffuseRgba(parsed.color, parsed.alpha);
  const material = createShadedMaterial({
    diffuse,
    diffuseMap: diffuseTexture,
    normalMap: normalTexture,
  }) as unknown as Material;
  // An alpha below 1 must actually blend; ShadedMaterial defaults to opaque coverage.
  if (parsed.alpha !== null && parsed.alpha < 1) (material as unknown as SurfaceMaterial).alphaMode = 'blend';
  // Preserve the AWD material block name as the material's authored name (empty → anonymous).
  material.name = parsed.name.length > 0 ? parsed.name : null;
  const index = document.materials.length;
  document.materials.push(material as unknown as MaterialLike);
  cache.set(materialId, index);
  return index;
}

// Resolves an AWD texture block id to a Flight Texture carrying an unresolved ImageResourceReference, or
// null when the texture is missing or its embedded payload was an unrecognized image format. The
// parser references — it does not decode: an embedded block emits an Embedded ref holding the encoded
// bytes; an external block emits an External ref holding the URL. The Texture's `image` stays null
// until @flighthq/scene-resources resolves the ref.
function resolveAwdTexture(
  textureId: number,
  textureBlocks: Readonly<Map<number, ParsedTexture>>,
  document: SceneDocument,
  warnings?: string[],
): Texture | null {
  const parsed = textureBlocks.get(textureId);
  if (parsed === undefined) {
    warnings?.push(`createSceneFromAwd2: material references texture block ${textureId} which was not found`);
    return null;
  }
  if (parsed.bytes !== null && parsed.mimeType !== null) {
    return createEmbeddedTextureRef(parsed.bytes, parsed.mimeType, document.resources);
  }
  if (parsed.url !== null) {
    return createExternalTextureRef(parsed.url, null, document.resources);
  }
  return null;
}

// Packs an AWD material's diffuse into a Flight 0xrrggbbaa color. AWD stores the color as 24-bit 0xrrggbb
// (property 1) and opacity as a separate float32 alpha (property 10); Flight folds them into one packed
// RGBA. A missing color defaults to white, a missing alpha to fully opaque.
function getAwdDiffuseRgba(color: number | null, alpha: number | null): number {
  const rgb = color ?? 0xffffff;
  const alphaByte = alpha !== null ? Math.max(0, Math.min(255, Math.round(alpha * 255))) : 0xff;
  return (((rgb << 8) >>> 0) | alphaByte) >>> 0;
}

// Parses a Skeleton block (type 101). Layout:
// name(VarString) → jointCount(uint16) → NumAttrList → per joint:
//   jointId(uint16) → parentId(uint16, 1-based, 0=root) → name(VarString)
//   → matrix4x3(12 × floatSize) → NumAttrList → UserAttrList
function parseSkeletonBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  matrixWide: boolean,
  warnings?: string[],
): ParsedSkeleton | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 2 > end) {
    warnings?.push('parseAwd2SkeletonAnimations: skeleton block truncated before name');
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    warnings?.push('parseAwd2SkeletonAnimations: skeleton block truncated before joint count');
    return null;
  }
  const jointCount = dv.getUint16(offset, true);
  offset += 2;

  offset = skipAwdAttrList(view, offset, end);

  const joints: ParsedJoint[] = [];
  for (let j = 0; j < jointCount; j++) {
    // Joint ID (sequential, 0-based).
    if (offset + 4 > end) {
      warnings?.push('parseAwd2SkeletonAnimations: skeleton block truncated before joint fields');
      return null;
    }
    offset += 2; // skip jointId (implicit from array position)
    const parentIndex = dv.getUint16(offset, true);
    offset += 2;

    if (offset + 2 > end) {
      warnings?.push('parseAwd2SkeletonAnimations: skeleton block truncated before joint name');
      return null;
    }
    const jointNameResult = readAwdString(view, source, offset);
    offset = jointNameResult.end;

    const floatSize = matrixWide ? 8 : 4;
    if (offset + 12 * floatSize > end) {
      warnings?.push('parseAwd2SkeletonAnimations: skeleton block truncated before joint transform');
      return null;
    }
    const transformResult = readAwdTransform(view, offset, matrixWide);
    offset = transformResult.end;

    offset = skipAwdAttrList(view, offset, end);
    offset = skipAwdAttrList(view, offset, end);

    joints.push({ name: jointNameResult.value, parentIndex, transform: transformResult.transform });
  }

  return { joints, name: nameResult.value };
}

// Parses a SkeletonPose block (type 102). Layout:
// name(VarString) → jointCount(uint16) → NumAttrList → per joint:
//   hasTransform(uint8) → optional matrix4x3(12 × floatSize)
function parseSkeletonPoseBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  matrixWide: boolean,
  warnings?: string[],
): ParsedSkeletonPose | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 2 > end) {
    warnings?.push('parseAwd2SkeletonAnimations: skeleton pose block truncated before name');
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    warnings?.push('parseAwd2SkeletonAnimations: skeleton pose block truncated before joint count');
    return null;
  }
  const jointCount = dv.getUint16(offset, true);
  offset += 2;

  offset = skipAwdAttrList(view, offset, end);

  const jointTransforms: (Float64Array | null)[] = [];
  for (let j = 0; j < jointCount; j++) {
    if (offset + 1 > end) {
      warnings?.push('parseAwd2SkeletonAnimations: skeleton pose block truncated before hasTransform');
      return null;
    }
    const hasTransform = dv.getUint8(offset);
    offset += 1;

    if (hasTransform !== 0) {
      const floatSize = matrixWide ? 8 : 4;
      if (offset + 12 * floatSize > end) {
        warnings?.push('parseAwd2SkeletonAnimations: skeleton pose block truncated before joint transform');
        return null;
      }
      const transformResult = readAwdTransform(view, offset, matrixWide);
      offset = transformResult.end;
      jointTransforms.push(transformResult.transform);
    } else {
      jointTransforms.push(null);
    }
  }

  return { jointTransforms, name: nameResult.value };
}

// Parses a SkeletonAnimation block (type 103). Layout:
// name(VarString) → frameCount(uint16) → NumAttrList → per frame:
//   poseBlockId(uint32) → duration(uint16, milliseconds)
function parseSkeletonAnimationBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  warnings?: string[],
): ParsedSkeletonAnimation | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 2 > end) {
    warnings?.push('parseAwd2SkeletonAnimations: skeleton animation block truncated before name');
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    warnings?.push('parseAwd2SkeletonAnimations: skeleton animation block truncated before frame count');
    return null;
  }
  const poseCount = dv.getUint16(offset, true);
  offset += 2;

  offset = skipAwdAttrList(view, offset, end);

  const poses: { duration: number; poseBlockId: number }[] = [];
  for (let p = 0; p < poseCount; p++) {
    if (offset + 4 > end) {
      warnings?.push('parseAwd2SkeletonAnimations: skeleton animation block truncated before pose block ID');
      return null;
    }
    const poseBlockId = dv.getUint32(offset, true);
    offset += 4;

    if (offset + 2 > end) {
      warnings?.push('parseAwd2SkeletonAnimations: skeleton animation block truncated before pose duration');
      return null;
    }
    const duration = dv.getUint16(offset, true);
    offset += 2;

    poses.push({ duration, poseBlockId });
  }

  return { name: nameResult.value, poses };
}

// Resolves the block-stream buffer to walk: the source unchanged for an uncompressed body, or the 12-byte
// header spliced in front of the inflated body for a compressed one — so the caller's walk is identical
// either way (compression byte rewritten to NONE, body-length field to the inflated length). Returns null
// (after a warning) when the compression method has no registered decompressor or the codec fails.
function rehydrateAwdBody(
  input: Uint8Array,
  context: string,
  warnings?: string[],
): { source: Uint8Array; view: DataView } | null {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const compression = input[7];
  if (compression === AWD2_COMPRESSION_NONE) return { source: input, view };

  const decompressor = awdDecompressors.get(compression);
  if (decompressor === undefined) {
    warnings?.push(
      `${context}: AWD compression method ${compression} has no registered decompressor; call registerAwd2Decompressor for this method (Away3D exports compressed by default) before importing this file`,
    );
    return null;
  }

  // The header's body-length field is the on-disk (compressed) length; the compressed stream is the bytes
  // from the end of the 12-byte header to there.
  const compressedEnd = Math.min(AWD2_HEADER_BYTES + view.getUint32(8, true), input.byteLength);
  const inflated = decompressor(input.subarray(AWD2_HEADER_BYTES, compressedEnd));
  if (inflated === null) {
    warnings?.push(
      `${context}: the registered decompressor for AWD compression method ${compression} failed to inflate the body`,
    );
    return null;
  }

  const rehydrated = new Uint8Array(AWD2_HEADER_BYTES + inflated.byteLength);
  rehydrated.set(input.subarray(0, AWD2_HEADER_BYTES), 0);
  rehydrated.set(inflated, AWD2_HEADER_BYTES);
  const rehydratedView = new DataView(rehydrated.buffer);
  rehydrated[7] = AWD2_COMPRESSION_NONE;
  rehydratedView.setUint32(8, inflated.byteLength, true);
  return { source: rehydrated, view: rehydratedView };
}

// Bitangent handedness written into every AWD tangent's W (B = W·normal×tangent). AWD carries no W and
// Away3D uses a single mesh-wide handedness (bitangent = normal×tangent in its left-handed space); the
// left→right-handed conversion (negateVec3Z, det = -1) inverts it, making -1 the correct Flight-space
// sign. Kept as one named constant so a render proof against a normal-mapped fixture (shambler) can flip
// it in one place if Away3D's convention proves to be the opposite chirality.
const AWD2_TANGENT_HANDEDNESS = -1;

// Opt-in decompressor registry keyed by the header compression byte. Empty by default so an inflate/LZMA
// codec is only pulled into a bundle when the caller registers one (registerAwd2Decompressor).
const awdDecompressors = new Map<number, AwdDecompressor>();

// Whether a decomposed pose scale departs from unit within tolerance — the gate for emitting a scale
// animation channel (skipped for the common identity-scale skeletons so clips stay lean).
function hasNonUnitScale(sx: number, sy: number, sz: number): boolean {
  return Math.abs(sx - 1) > 1e-4 || Math.abs(sy - 1) > 1e-4 || Math.abs(sz - 1) > 1e-4;
}

interface ParsedJoint {
  name: string;
  parentIndex: number;
  transform: Float64Array;
}

interface ParsedSkeleton {
  joints: ParsedJoint[];
  name: string;
}

interface ParsedSkeletonAnimation {
  name: string;
  poses: { duration: number; poseBlockId: number }[];
}

interface ParsedSkeletonPose {
  jointTransforms: (Float64Array | null)[];
  name: string;
}
