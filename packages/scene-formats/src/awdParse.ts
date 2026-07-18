import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation';
import { detectImageMimeType } from '@flighthq/image-codec';
import { createBlinnPhongMaterial } from '@flighthq/materials';
import { CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, computeMeshGeometryNormals, createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene, createSceneNode } from '@flighthq/scene';
import { createSkeleton3D } from '@flighthq/skeleton3d';
import { createTexture } from '@flighthq/texture';
import type { AnimationClip, Material, SceneNode, Skeleton3D, Skin, Texture } from '@flighthq/types';
import {
  MeshKind,
  ResourceResolutionState,
  SceneAnimationPathTranslation,
  SceneResourceRefKind,
} from '@flighthq/types';

import {
  AWD_BLOCK_CONTAINER,
  AWD_BLOCK_HEADER_BYTES,
  AWD_BLOCK_MATERIAL,
  AWD_BLOCK_MESH_INSTANCE,
  AWD_BLOCK_SKELETON,
  AWD_BLOCK_SKELETON_ANIMATION,
  AWD_BLOCK_SKELETON_POSE,
  AWD_BLOCK_TEXTURE,
  AWD_BLOCK_TRIANGLE_GEOMETRY,
  AWD_COMPRESSION_NONE,
  AWD_DATA_FLOAT32,
  AWD_DATA_FLOAT64,
  AWD_DATA_INT16,
  AWD_DATA_INT32,
  AWD_DATA_INT8,
  AWD_DATA_UINT16,
  AWD_DATA_UINT32,
  AWD_DATA_UINT8,
  AWD_HEADER_BYTES,
  AWD_MAGIC_0,
  AWD_MAGIC_1,
  AWD_MAGIC_2,
  AWD_MATERIAL_PROP_COLOR,
  AWD_MATERIAL_PROP_DIFFUSE_TEXTURE,
  AWD_NAMESPACE_CORE,
  AWD_STREAM_INDICES,
  AWD_STREAM_JOINT_INDICES,
  AWD_STREAM_JOINT_WEIGHTS,
  AWD_STREAM_NORMALS,
  AWD_STREAM_POSITIONS,
  AWD_STREAM_TANGENTS,
  AWD_STREAM_UVS,
  AWD_TEXTURE_TYPE_EMBEDDED,
} from './awdSchema';
import type { SceneImport } from './sceneImport';
import type { SkinInfluence } from './shared';
import {
  CANONICAL_FLOATS_PER_VERTEX,
  CANONICAL_LAYOUT,
  convertTransformLhToRh,
  findSceneSkeletonJoints,
  negateVec3Z,
  packSkinInfluences,
  reverseTriangleWinding,
  SKINNED_FLOATS_PER_VERTEX,
} from './shared';

// Parses an Away3D AWD 2.x binary file into a Scene. The 12-byte header (magic `AWD`, version,
// flags, compression, body length) is validated, then the block stream is walked to extract
// geometry blocks (type 1), container blocks (type 22), mesh-instance blocks (type 23), material
// blocks (type 81), and texture blocks (type 82). Mesh instances reference geometry and material
// blocks by block ID; materials reference texture blocks the same way.
//
// A mesh instance's per-subset materials are resolved to Flight materials: an AWD material becomes a
// BlinnPhongMaterial (the format's own shading model — AwayJS MethodMaterial), carrying its flat
// diffuse color and/or a diffuseMap referencing the AWD texture. The parser does not reinterpret into
// PBR/Unlit — that is the caller's explicit choice. Each texture's image source is emitted as an
// unresolved SceneResourceRef on the Texture (`Texture.resource`, `image` left null) — embedded
// payloads as an Embedded ref carrying the encoded bytes, external-URL textures as an External ref
// carrying the URL. @flighthq/scene-resources resolves those refs on the caller's schedule. Only an
// embedded payload of an unrecognized image format warns and leaves the subset unmaterialed.
//
// Only uncompressed AWD files are supported; compressed files (deflate or LZMA) push a warning
// and return an empty scene. Malformed input pushes a warning and returns an empty scene rather
// than throwing.
export function createSceneFromAwd(bytes: Readonly<Uint8Array>, warnings?: string[]): Scene {
  const source = bytes as Uint8Array;
  if (source.byteLength < AWD_HEADER_BYTES) {
    warnings?.push('createSceneFromAwd: byte length is smaller than the 12-byte AWD header');
    return createScene();
  }

  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);

  if (source[0] !== AWD_MAGIC_0 || source[1] !== AWD_MAGIC_1 || source[2] !== AWD_MAGIC_2) {
    warnings?.push("createSceneFromAwd: magic is not 'AWD'; not an AWD file");
    return createScene();
  }

  const compression = source[7];
  if (compression !== AWD_COMPRESSION_NONE) {
    warnings?.push(
      `createSceneFromAwd: compression method ${compression} is not supported; only uncompressed AWD is supported`,
    );
    return createScene();
  }

  const bodyLength = view.getUint32(8, true);
  const bodyEnd = Math.min(AWD_HEADER_BYTES + bodyLength, source.byteLength);

  const geometryBlocks = new Map<number, ParsedGeometry[]>();
  const containerBlocks = new Map<number, ParsedContainer>();
  const meshInstanceBlocks = new Map<number, ParsedMeshInstance>();
  const materialBlocks = new Map<number, ParsedMaterial>();
  const textureBlocks = new Map<number, ParsedTexture>();
  const skeletonBlocks = new Map<number, ParsedSkeleton>();

  let offset = AWD_HEADER_BYTES;
  while (offset + AWD_BLOCK_HEADER_BYTES <= bodyEnd) {
    const blockId = view.getUint32(offset, true);
    const namespace = source[offset + 4];
    const blockType = source[offset + 5];
    const blockFlags = source[offset + 6];
    const blockLength = view.getUint32(offset + 7, true);
    const blockDataStart = offset + AWD_BLOCK_HEADER_BYTES;

    if (blockDataStart + blockLength > bodyEnd) {
      warnings?.push('createSceneFromAwd: block length runs past the end of the body');
      break;
    }

    const matrixWide = (blockFlags & 1) !== 0;
    const geometryWide = (blockFlags & 2) !== 0;

    if (namespace === AWD_NAMESPACE_CORE) {
      if (blockType === AWD_BLOCK_TRIANGLE_GEOMETRY) {
        const geoms = parseTriangleGeometryBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          geometryWide,
          warnings,
        );
        geometryBlocks.set(blockId, geoms);
      } else if (blockType === AWD_BLOCK_CONTAINER) {
        const container = parseContainerBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          warnings,
        );
        if (container !== null) containerBlocks.set(blockId, container);
      } else if (blockType === AWD_BLOCK_MESH_INSTANCE) {
        const meshInst = parseMeshInstanceBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          warnings,
        );
        if (meshInst !== null) meshInstanceBlocks.set(blockId, meshInst);
      } else if (blockType === AWD_BLOCK_MATERIAL) {
        const material = parseMaterialBlock(view, source, blockDataStart, blockDataStart + blockLength, warnings);
        if (material !== null) materialBlocks.set(blockId, material);
      } else if (blockType === AWD_BLOCK_TEXTURE) {
        const texture = parseTextureBlock(view, source, blockDataStart, blockDataStart + blockLength, warnings);
        if (texture !== null) textureBlocks.set(blockId, texture);
      } else if (blockType === AWD_BLOCK_SKELETON) {
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

  const scene = createScene();
  const sceneNodes = new Map<number, SceneNode>();

  // Build the file's skeleton (if any) once and hang its joint hierarchy under the scene, so a skinned
  // mesh binds to it via mesh.skin and its joint nodes are posable by the animation clip. AWD binds a
  // mesh to a skeleton through an animator block Flight does not parse yet; with the common single-
  // skeleton file (the shambler) every skinned mesh is bound to that one skeleton. The joint nodes are
  // reachable as mesh.skin.skeleton.joints — the same handle parseAwdSkeletonAnimation binds against.
  let skin: Skin | null = null;
  if (skeletonBlocks.size > 0) {
    const built = buildAwdSkeleton(skeletonBlocks.values().next().value!);
    addNodeChild(scene, built.skeletonRoot);
    skin = { skeleton: built.skeleton, skeletonRoot: built.skeletonRoot };
    if (skeletonBlocks.size > 1) {
      warnings?.push(
        `createSceneFromAwd: file has ${skeletonBlocks.size} skeletons; every skinned mesh binds to the first`,
      );
    }
  }

  for (const [blockId, container] of containerBlocks) {
    const node = createSceneNode(undefined, { name: container.name || undefined });
    applyAwdTransform(node, container.transform);
    sceneNodes.set(blockId, node);
  }

  // One Flight Material per AWD material block, shared across every subset that references it (and
  // thus one Texture + one ImageResource per shared texture). Keyed by AWD material block id.
  const resolvedMaterials = new Map<number, Material | null>();
  const materialForSubset = (meshInst: ParsedMeshInstance, subsetIndex: number): (Material | null)[] => {
    const materialId = subsetIndex < meshInst.materialIds.length ? meshInst.materialIds[subsetIndex] : 0;
    const material = resolveAwdMaterial(materialId, materialBlocks, textureBlocks, resolvedMaterials, warnings);
    return material !== null ? [material] : [];
  };

  for (const [blockId, meshInst] of meshInstanceBlocks) {
    const geometries = geometryBlocks.get(meshInst.geometryId);
    let node: SceneNode;
    if (geometries !== undefined && geometries.length > 0) {
      if (geometries.length === 1) {
        // node = mesh here, so the mesh carries the instance name directly; the multi-geometry
        // branch instead names the wrapping container (its subset meshes stay anonymous parts).
        const mesh = createMesh(geometries[0].geometry, materialForSubset(meshInst, 0), MeshKind, {
          name: meshInst.name || undefined,
        });
        if (skin !== null && geometries[0].skinned) mesh.skin = skin;
        node = mesh as unknown as SceneNode;
      } else {
        node = createSceneNode(undefined, { name: meshInst.name || undefined });
        for (let i = 0; i < geometries.length; i++) {
          const mesh = createMesh(geometries[i].geometry, materialForSubset(meshInst, i));
          if (skin !== null && geometries[i].skinned) mesh.skin = skin;
          addNodeChild(node, mesh as unknown as SceneNode);
        }
      }
    } else {
      node = createSceneNode(undefined, { name: meshInst.name || undefined });
      if (meshInst.geometryId !== 0) {
        warnings?.push(
          `createSceneFromAwd: mesh instance block ${blockId} references geometry block ${meshInst.geometryId} which was not found`,
        );
      }
    }
    applyAwdTransform(node, meshInst.transform);
    sceneNodes.set(blockId, node);
  }

  const parented = new Set<number>();
  for (const [blockId, container] of containerBlocks) {
    if (container.parentId !== 0) {
      const parent = sceneNodes.get(container.parentId);
      if (parent !== undefined) {
        addNodeChild(parent, sceneNodes.get(blockId)!);
        parented.add(blockId);
      }
    }
  }
  for (const [blockId, meshInst] of meshInstanceBlocks) {
    if (meshInst.parentId !== 0) {
      const parent = sceneNodes.get(meshInst.parentId);
      if (parent !== undefined) {
        addNodeChild(parent, sceneNodes.get(blockId)!);
        parented.add(blockId);
      }
    }
  }

  for (const [blockId, node] of sceneNodes) {
    if (!parented.has(blockId)) {
      addNodeChild(scene, node);
    }
  }

  return scene;
}

// Imports an AWD file as a whole: the scene plus its skeleton animation clip, folded into one call so
// the caller never re-threads the joint handle. The assembly-tier sibling of createSceneFromAwd —
// builds the scene, then binds the file's skeleton animation to the joints that scene already holds
// (createSceneFromAwd exposes them as mesh.skin.skeleton.joints). AWD declares a single scene, so
// `scenes` is a one-element array; `animations` is empty when the file carries no skeleton animation.
export function importAwd(bytes: Readonly<Uint8Array>, warnings?: string[]): SceneImport {
  const scene = createSceneFromAwd(bytes, warnings);
  const joints = findSceneSkeletonJoints(scene);
  const clip = joints !== null ? parseAwdSkeletonAnimation(bytes, joints, warnings) : null;
  return { animations: clip !== null ? [clip] : [], scene, scenes: [scene] };
}

// Parses AWD skeleton-pose and skeleton-animation blocks into an AnimationClip that drives the given
// joint SceneNodes — the joints createSceneFromAwd built and exposed as mesh.skin.skeleton.joints.
// Binding to those same nodes (rather than freshly-created ones) is what lets the clip deform the
// skinned mesh: the animation, the skeleton, and the skin all reference one joint hierarchy. This
// mirrors parseMd5Anim(source, joints). Channels drive each joint's translation per keyframe. Returns
// null when the header is invalid or no skeleton/animation blocks are found. The `joints` array must
// be in AWD skeleton order (index j = joint j); a length mismatch with the file's skeleton warns.
export function parseAwdSkeletonAnimation(
  bytes: Readonly<Uint8Array>,
  joints: readonly SceneNode[],
  warnings?: string[],
): AnimationClip | null {
  const source = bytes as Uint8Array;
  if (source.byteLength < AWD_HEADER_BYTES) {
    warnings?.push('parseAwdSkeletonAnimation: byte length is smaller than the 12-byte AWD header');
    return null;
  }

  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);

  if (source[0] !== AWD_MAGIC_0 || source[1] !== AWD_MAGIC_1 || source[2] !== AWD_MAGIC_2) {
    warnings?.push("parseAwdSkeletonAnimation: magic is not 'AWD'; not an AWD file");
    return null;
  }

  const compression = source[7];
  if (compression !== AWD_COMPRESSION_NONE) {
    warnings?.push(
      `parseAwdSkeletonAnimation: compression method ${compression} is not supported; only uncompressed AWD is supported`,
    );
    return null;
  }

  const bodyLength = view.getUint32(8, true);
  const bodyEnd = Math.min(AWD_HEADER_BYTES + bodyLength, source.byteLength);

  const skeletonBlocks = new Map<number, ParsedSkeleton>();
  const poseBlocks = new Map<number, ParsedSkeletonPose>();
  const animationBlocks = new Map<number, ParsedSkeletonAnimation>();

  let offset = AWD_HEADER_BYTES;
  while (offset + AWD_BLOCK_HEADER_BYTES <= bodyEnd) {
    const blockId = view.getUint32(offset, true);
    const namespace = source[offset + 4];
    const blockType = source[offset + 5];
    const blockFlags = source[offset + 6];
    const blockLength = view.getUint32(offset + 7, true);
    const blockDataStart = offset + AWD_BLOCK_HEADER_BYTES;

    if (blockDataStart + blockLength > bodyEnd) {
      warnings?.push('parseAwdSkeletonAnimation: block length runs past the end of the body');
      break;
    }

    const matrixWide = (blockFlags & 1) !== 0;

    if (namespace === AWD_NAMESPACE_CORE) {
      if (blockType === AWD_BLOCK_SKELETON) {
        const skeleton = parseSkeletonBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          warnings,
        );
        if (skeleton !== null) skeletonBlocks.set(blockId, skeleton);
      } else if (blockType === AWD_BLOCK_SKELETON_POSE) {
        const pose = parseSkeletonPoseBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          warnings,
        );
        if (pose !== null) poseBlocks.set(blockId, pose);
      } else if (blockType === AWD_BLOCK_SKELETON_ANIMATION) {
        const anim = parseSkeletonAnimationBlock(view, source, blockDataStart, blockDataStart + blockLength, warnings);
        if (anim !== null) animationBlocks.set(blockId, anim);
      }
    }

    offset = blockDataStart + blockLength;
  }

  if (skeletonBlocks.size === 0) {
    warnings?.push('parseAwdSkeletonAnimation: no skeleton blocks found');
    return null;
  }
  if (animationBlocks.size === 0) {
    warnings?.push('parseAwdSkeletonAnimation: no skeleton animation blocks found');
    return null;
  }

  const parsedSkeleton = skeletonBlocks.values().next().value!;
  const parsedAnimation = animationBlocks.values().next().value!;

  if (joints.length < parsedSkeleton.joints.length) {
    warnings?.push(
      `parseAwdSkeletonAnimation: joints array has ${joints.length} nodes but skeleton has ${parsedSkeleton.joints.length} joints`,
    );
    return null;
  }

  const jointCount = parsedSkeleton.joints.length;
  const poseCount = parsedAnimation.poses.length;

  if (poseCount === 0) {
    warnings?.push('parseAwdSkeletonAnimation: skeleton animation has no poses');
    return null;
  }

  const times: number[] = [];
  let timeAccumulator = 0;
  for (let p = 0; p < poseCount; p++) {
    times.push(timeAccumulator);
    timeAccumulator += parsedAnimation.poses[p].duration / 1000;
  }

  const channels = [];
  for (let j = 0; j < jointCount; j++) {
    const values: number[] = [];
    for (let p = 0; p < poseCount; p++) {
      const poseBlockId = parsedAnimation.poses[p].poseBlockId;
      const pose = poseBlocks.get(poseBlockId);
      if (pose === undefined) {
        warnings?.push(
          `parseAwdSkeletonAnimation: pose block ${poseBlockId} referenced by animation not found; using identity`,
        );
        values.push(0, 0, 0);
      } else if (j < pose.jointTransforms.length && pose.jointTransforms[j] !== null) {
        const transform = pose.jointTransforms[j]!;
        values.push(transform[9], transform[10], transform[11]);
      } else {
        values.push(0, 0, 0);
      }
    }

    const track = createAnimationTrack({
      components: 3,
      times,
      values,
    });
    channels.push(createAnimationChannel(track, { node: joints[j], path: SceneAnimationPathTranslation }));
  }

  return createAnimationClip(channels, timeAccumulator);
}

// Builds the joint SceneNode hierarchy + Skeleton3D from a parsed AWD skeleton block, hung under a
// "skeleton" group node so the whole rig can be attached to the scene as one child (the same shape
// createSceneFromMd5Mesh uses). Joint local transforms are applied and the parent chain wired (AWD
// parent index is 1-based, 0 = root; roots hang under the group). createSkeleton3D with no explicit
// inverse-bind matrices captures the resulting world transforms as the rest pose, so the skinned mesh
// renders undeformed until the animation poses the joints. Callers get the joint nodes back for
// binding both the mesh skin and (via mesh.skin.skeleton.joints) the animation clip to one hierarchy.
function buildAwdSkeleton(parsedSkeleton: Readonly<ParsedSkeleton>): {
  jointNodes: SceneNode[];
  skeleton: Skeleton3D;
  skeletonRoot: SceneNode;
} {
  const skeletonRoot = createSceneNode(undefined, { name: 'skeleton' });
  const jointNodes: SceneNode[] = [];
  const jointNames: string[] = [];
  for (let j = 0; j < parsedSkeleton.joints.length; j++) {
    const joint = parsedSkeleton.joints[j];
    const node = createSceneNode(undefined, { name: joint.name || undefined });
    applyAwdTransform(node, joint.transform);
    jointNodes.push(node);
    jointNames.push(joint.name);
  }

  for (let j = 0; j < parsedSkeleton.joints.length; j++) {
    const parentIndex1 = parsedSkeleton.joints[j].parentIndex;
    if (parentIndex1 > 0 && parentIndex1 - 1 < jointNodes.length) {
      addNodeChild(jointNodes[parentIndex1 - 1], jointNodes[j]);
    } else {
      addNodeChild(skeletonRoot, jointNodes[j]);
    }
  }

  const skeleton = createSkeleton3D(jointNodes, undefined, jointNames);
  return { jointNodes, skeleton, skeletonRoot };
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

// A parsed AWD material block (type 81). `diffuseTextureId`/`color` are the two paths Flight
// realizes; 0 means "absent". Other AWD material properties (normal map, methods, blend flags) are
// parsed past but not yet mapped.
interface ParsedMaterial {
  color: number | null;
  diffuseTextureId: number;
  name: string;
}

// A parsed AWD texture block (type 82). Exactly one source form is populated: `bytes` (+ detected
// `mimeType`) for an embedded, self-describing image payload (PNG/JPEG/…), or `url` for an external
// reference (the block's name is the URL in AWD's external form). Both null when an embedded payload
// was not a recognized image format (dropped). The parser emits these as a SceneResourceRef; it does
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

// AWD stores transforms as 12 column-major floats: [c0x,c0y,c0z, c1x,c1y,c1z,
// c2x,c2y,c2z, tx,ty,tz] → 4×4 column-major with w-column [0,0,0,1].
function applyAwdTransform(node: SceneNode, transform: Readonly<Float64Array>): void {
  const m = node.localMatrix.m;
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
  invalidateNodeLocalTransform(node);
}

function awdDataTypeByteSize(dataType: number): number {
  switch (dataType) {
    case AWD_DATA_INT8:
    case AWD_DATA_UINT8:
      return 1;
    case AWD_DATA_INT16:
    case AWD_DATA_UINT16:
      return 2;
    case AWD_DATA_INT32:
    case AWD_DATA_UINT32:
    case AWD_DATA_FLOAT32:
      return 4;
    case AWD_DATA_FLOAT64:
      return 8;
    default:
      return 4;
  }
}

function readAwdDataValue(view: Readonly<DataView>, offset: number, dataType: number): number {
  const dv = view as DataView;
  switch (dataType) {
    case AWD_DATA_INT8:
      return dv.getInt8(offset);
    case AWD_DATA_INT16:
      return dv.getInt16(offset, true);
    case AWD_DATA_INT32:
      return dv.getInt32(offset, true);
    case AWD_DATA_UINT8:
      return dv.getUint8(offset);
    case AWD_DATA_UINT16:
      return dv.getUint16(offset, true);
    case AWD_DATA_UINT32:
      return dv.getUint32(offset, true);
    case AWD_DATA_FLOAT32:
      return dv.getFloat32(offset, true);
    case AWD_DATA_FLOAT64:
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
        warnings?.push('createSceneFromAwd: stream data runs past the end of the block');
        break;
      }

      // AWD stores per-vertex joint indices as uint16 (Away3D reads them with readUnsignedShort),
      // regardless of the stream's declared data type — exporters write float32 in that field but
      // pack the payload as tight uint16 indices. Read them as uint16 by byte length; the paired
      // weight stream is genuine float32 and goes through the generic reader below.
      if (streamType === AWD_STREAM_JOINT_INDICES) {
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
        case AWD_STREAM_POSITIONS:
          positions = values;
          break;
        case AWD_STREAM_INDICES:
          indices = values;
          break;
        case AWD_STREAM_UVS:
          uvs = values;
          break;
        case AWD_STREAM_NORMALS:
          normals = values;
          break;
        case AWD_STREAM_TANGENTS:
          tangents = values;
          break;
        case AWD_STREAM_JOINT_WEIGHTS:
          jointWeights = values;
          break;
        default:
          break;
      }
    }

    // UserAttrList for sub-mesh.
    offset = skipAwdAttrList(view, offset, end);

    if (positions === null || positions.length < 3) {
      warnings?.push('createSceneFromAwd: sub-mesh has no positions or fewer than 3 position values');
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
        warnings?.push('createSceneFromAwd: skin streams do not match vertex count; sub-mesh imported without skin');
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
    warnings?.push('createSceneFromAwd: container block truncated before parent ID');
    return null;
  }
  const parentId = dv.getUint32(offset, true);
  offset += 4;

  const floatSize = matrixWide ? 8 : 4;
  if (offset + 12 * floatSize > end) {
    warnings?.push('createSceneFromAwd: container block truncated before transform');
    return null;
  }
  const transformResult = readAwdTransform(view, offset, matrixWide);
  offset = transformResult.end;

  if (offset + 2 > end) {
    warnings?.push('createSceneFromAwd: container block truncated before name');
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
    warnings?.push('createSceneFromAwd: mesh instance block truncated before parent ID');
    return null;
  }
  const parentId = dv.getUint32(offset, true);
  offset += 4;

  const floatSize = matrixWide ? 8 : 4;
  if (offset + 12 * floatSize > end) {
    warnings?.push('createSceneFromAwd: mesh instance block truncated before transform');
    return null;
  }
  const transformResult = readAwdTransform(view, offset, matrixWide);
  offset = transformResult.end;

  if (offset + 2 > end) {
    warnings?.push('createSceneFromAwd: mesh instance block truncated before name');
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 4 > end) {
    warnings?.push('createSceneFromAwd: mesh instance block truncated before geometry ID');
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
// Flight reads the diffuse texture id (property 2) and the flat color (property 1) — the properties
// precede the methods, so the method/attr tail is left unread. Normal maps, shading methods, and
// blend flags are not yet mapped.
function parseMaterialBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  warnings?: string[],
): ParsedMaterial | null {
  let offset = start;

  if (offset + 2 > end) {
    warnings?.push('createSceneFromAwd: material block truncated before name');
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    warnings?.push(`createSceneFromAwd: material '${nameResult.value}' truncated before type`);
    return null;
  }
  offset += 1; // matType (uint8) — texture vs color is inferred from which properties are present
  offset += 1; // numMethods (uint8)

  const props = readAwdProperties(view, offset, end);
  const diffuseTextureId = readAwdPropertyUint32(view, props.values, AWD_MATERIAL_PROP_DIFFUSE_TEXTURE) ?? 0;
  const color = readAwdPropertyUint32(view, props.values, AWD_MATERIAL_PROP_COLOR);

  return { color, diffuseTextureId, name: nameResult.value };
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
    warnings?.push('createSceneFromAwd: texture block truncated before name');
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 5 > end) {
    warnings?.push(`createSceneFromAwd: texture '${nameResult.value}' truncated before payload`);
    return null;
  }
  const texType = (source as Uint8Array)[offset];
  offset += 1;
  const dataLen = dv.getUint32(offset, true);
  offset += 4;

  if (offset + dataLen > end) {
    warnings?.push(`createSceneFromAwd: texture '${nameResult.value}' declares ${dataLen} bytes but data is truncated`);
    return null;
  }

  if (texType !== AWD_TEXTURE_TYPE_EMBEDDED) {
    // AWD's external form carries the image URL as the block name; emit it as an External ref for
    // the resolver to fetch, rather than dropping it.
    return { bytes: null, mimeType: null, name: nameResult.value, url: nameResult.value };
  }

  const bytes = (source as Uint8Array).slice(offset, offset + dataLen);
  const mimeType = detectImageMimeType(bytes);
  if (mimeType === null) {
    warnings?.push(`createSceneFromAwd: texture '${nameResult.value}' payload is not a recognized image format`);
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

function readAwdPropertyUint32(
  view: Readonly<DataView>,
  values: Readonly<Map<number, { length: number; offset: number }>>,
  key: number,
): number | null {
  const entry = values.get(key);
  if (entry === undefined || entry.length < 4) return null;
  return (view as DataView).getUint32(entry.offset, true);
}

// Resolves an AWD material block id to a Flight Material, memoized so a material shared by several
// subsets yields one Material (and one Texture/ImageResource per shared texture). A textured material
// becomes a StandardPbrMaterial with a baseColorMap; a flat-color material becomes an UnlitMaterial;
// anything that resolves to neither returns null (a bare, unmaterialed subset).
function resolveAwdMaterial(
  materialId: number,
  materialBlocks: Readonly<Map<number, ParsedMaterial>>,
  textureBlocks: Readonly<Map<number, ParsedTexture>>,
  cache: Map<number, Material | null>,
  warnings?: string[],
): Material | null {
  if (materialId === 0) return null;
  const cached = cache.get(materialId);
  if (cached !== undefined) return cached;

  const parsed = materialBlocks.get(materialId);
  if (parsed === undefined) {
    warnings?.push(`createSceneFromAwd: mesh references material block ${materialId} which was not found`);
    cache.set(materialId, null);
    return null;
  }

  // AWD's material model is Blinn-Phong (AwayJS MethodMaterial), so decode to BlinnPhongMaterial —
  // the format's own shading model — rather than reinterpreting into PBR/Unlit. The block carries a
  // flat diffuse color (property 1) and/or a diffuse texture (property 2); map both faithfully. A
  // caller wanting metallic-roughness converts explicitly downstream (getPbrRoughnessFromPhongShininess
  // + getPhongToPbrLightExposure); the importer does not presume a PBR pipeline.
  const diffuseTexture =
    parsed.diffuseTextureId !== 0 ? resolveAwdTexture(parsed.diffuseTextureId, textureBlocks, warnings) : null;
  let material: Material | null = null;
  if (diffuseTexture !== null || parsed.color !== null) {
    material = createBlinnPhongMaterial({
      diffuse: parsed.color !== null ? awdColorToRgba(parsed.color) : 0xffffffff,
      diffuseMap: diffuseTexture,
    }) as unknown as Material;
    // Preserve the AWD material block name as the material's authored name (empty → anonymous).
    material.name = parsed.name.length > 0 ? parsed.name : null;
  }

  cache.set(materialId, material);
  return material;
}

// Resolves an AWD texture block id to a Flight Texture carrying an unresolved SceneResourceRef, or
// null when the texture is missing or its embedded payload was an unrecognized image format. The
// parser references — it does not decode: an embedded block emits an Embedded ref holding the encoded
// bytes; an external block emits an External ref holding the URL. The Texture's `image` stays null
// until @flighthq/scene-resources resolves the ref.
function resolveAwdTexture(
  textureId: number,
  textureBlocks: Readonly<Map<number, ParsedTexture>>,
  warnings?: string[],
): Texture | null {
  const parsed = textureBlocks.get(textureId);
  if (parsed === undefined) {
    warnings?.push(`createSceneFromAwd: material references texture block ${textureId} which was not found`);
    return null;
  }
  if (parsed.bytes !== null && parsed.mimeType !== null) {
    return createTexture({
      resource: {
        kind: SceneResourceRefKind.Embedded,
        bytes: parsed.bytes,
        mimeType: parsed.mimeType,
        state: ResourceResolutionState.Unresolved,
      },
    });
  }
  if (parsed.url !== null) {
    return createTexture({
      resource: {
        kind: SceneResourceRefKind.External,
        uri: parsed.url,
        basePath: null,
        mimeType: null,
        state: ResourceResolutionState.Unresolved,
      },
    });
  }
  return null;
}

// AWD packs material color as 24-bit 0xrrggbb; Flight colors are 32-bit 0xrrggbbaa. Widen with a
// fully-opaque alpha.
function awdColorToRgba(color: number): number {
  return ((color << 8) | 0xff) >>> 0;
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
    warnings?.push('parseAwdSkeletonAnimation: skeleton block truncated before name');
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    warnings?.push('parseAwdSkeletonAnimation: skeleton block truncated before joint count');
    return null;
  }
  const jointCount = dv.getUint16(offset, true);
  offset += 2;

  offset = skipAwdAttrList(view, offset, end);

  const joints: ParsedJoint[] = [];
  for (let j = 0; j < jointCount; j++) {
    // Joint ID (sequential, 0-based).
    if (offset + 4 > end) {
      warnings?.push('parseAwdSkeletonAnimation: skeleton block truncated before joint fields');
      return null;
    }
    offset += 2; // skip jointId (implicit from array position)
    const parentIndex = dv.getUint16(offset, true);
    offset += 2;

    if (offset + 2 > end) {
      warnings?.push('parseAwdSkeletonAnimation: skeleton block truncated before joint name');
      return null;
    }
    const jointNameResult = readAwdString(view, source, offset);
    offset = jointNameResult.end;

    const floatSize = matrixWide ? 8 : 4;
    if (offset + 12 * floatSize > end) {
      warnings?.push('parseAwdSkeletonAnimation: skeleton block truncated before joint transform');
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
    warnings?.push('parseAwdSkeletonAnimation: skeleton pose block truncated before name');
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    warnings?.push('parseAwdSkeletonAnimation: skeleton pose block truncated before joint count');
    return null;
  }
  const jointCount = dv.getUint16(offset, true);
  offset += 2;

  offset = skipAwdAttrList(view, offset, end);

  const jointTransforms: (Float64Array | null)[] = [];
  for (let j = 0; j < jointCount; j++) {
    if (offset + 1 > end) {
      warnings?.push('parseAwdSkeletonAnimation: skeleton pose block truncated before hasTransform');
      return null;
    }
    const hasTransform = dv.getUint8(offset);
    offset += 1;

    if (hasTransform !== 0) {
      const floatSize = matrixWide ? 8 : 4;
      if (offset + 12 * floatSize > end) {
        warnings?.push('parseAwdSkeletonAnimation: skeleton pose block truncated before joint transform');
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
    warnings?.push('parseAwdSkeletonAnimation: skeleton animation block truncated before name');
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    warnings?.push('parseAwdSkeletonAnimation: skeleton animation block truncated before frame count');
    return null;
  }
  const poseCount = dv.getUint16(offset, true);
  offset += 2;

  offset = skipAwdAttrList(view, offset, end);

  const poses: { duration: number; poseBlockId: number }[] = [];
  for (let p = 0; p < poseCount; p++) {
    if (offset + 4 > end) {
      warnings?.push('parseAwdSkeletonAnimation: skeleton animation block truncated before pose block ID');
      return null;
    }
    const poseBlockId = dv.getUint32(offset, true);
    offset += 4;

    if (offset + 2 > end) {
      warnings?.push('parseAwdSkeletonAnimation: skeleton animation block truncated before pose duration');
      return null;
    }
    const duration = dv.getUint16(offset, true);
    offset += 2;

    poses.push({ duration, poseBlockId });
  }

  return { name: nameResult.value, poses };
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
