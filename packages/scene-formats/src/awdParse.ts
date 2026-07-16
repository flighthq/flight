import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation';
import { createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene, createSceneNode } from '@flighthq/scene';
import { createSkeleton3D } from '@flighthq/skeleton3d';
import type { AnimationClip, SceneNode, Skeleton3D } from '@flighthq/types';
import { SceneAnimationPathTranslation } from '@flighthq/types';

import {
  AWD_BLOCK_CONTAINER,
  AWD_BLOCK_HEADER_BYTES,
  AWD_BLOCK_MESH_INSTANCE,
  AWD_BLOCK_SKELETON,
  AWD_BLOCK_SKELETON_ANIMATION,
  AWD_BLOCK_SKELETON_POSE,
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
  AWD_NAMESPACE_CORE,
  AWD_STREAM_INDICES,
  AWD_STREAM_NORMALS,
  AWD_STREAM_POSITIONS,
  AWD_STREAM_TANGENTS,
  AWD_STREAM_UVS,
} from './awdSchema';
import { CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT } from './shared';

// Parses an Away3D AWD 2.x binary file into a Scene. The 12-byte header (magic `AWD`, version,
// flags, compression, body length) is validated, then the block stream is walked to extract
// geometry blocks (type 1), container blocks (type 22), and mesh-instance blocks (type 23).
// Mesh instances reference geometry blocks by block ID.
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
      }
    }

    offset = blockDataStart + blockLength;
  }

  const scene = createScene();
  const sceneNodes = new Map<number, SceneNode>();

  for (const [blockId, container] of containerBlocks) {
    const node = createSceneNode(undefined, { name: container.name || undefined });
    applyAwdTransform(node, container.transform);
    sceneNodes.set(blockId, node);
  }

  for (const [blockId, meshInst] of meshInstanceBlocks) {
    const geometries = geometryBlocks.get(meshInst.geometryId);
    let node: SceneNode;
    if (geometries !== undefined && geometries.length > 0) {
      if (geometries.length === 1) {
        node = createMesh(geometries[0].geometry, []) as unknown as SceneNode;
      } else {
        node = createSceneNode(undefined, { name: meshInst.name || undefined });
        for (let i = 0; i < geometries.length; i++) {
          addNodeChild(node, createMesh(geometries[i].geometry, []) as unknown as SceneNode);
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

// Parses AWD skeleton, skeleton-pose, and skeleton-animation blocks from the same AWD binary that
// createSceneFromAwd handles. Returns the first parsed Skeleton (joints as a SceneNode hierarchy
// with transforms applied), an AnimationClip whose channels drive each joint's translation per
// keyframe, or null when no animation blocks are found.
export function parseAwdSkeletonAnimation(
  bytes: Readonly<Uint8Array>,
  warnings?: string[],
): { clip: AnimationClip; skeleton: Skeleton3D } | null {
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

  const jointNodes: SceneNode[] = [];
  const jointNames: string[] = [];
  for (let j = 0; j < parsedSkeleton.joints.length; j++) {
    const joint = parsedSkeleton.joints[j];
    const node = createSceneNode(undefined, { name: joint.name || undefined });
    applyAwdTransform(node, joint.transform);
    jointNodes.push(node);
    jointNames.push(joint.name);
  }

  // Wire up parent-child relationships. Parent index is 1-based (0 = root / no parent).
  for (let j = 0; j < parsedSkeleton.joints.length; j++) {
    const parentIndex1 = parsedSkeleton.joints[j].parentIndex;
    if (parentIndex1 > 0 && parentIndex1 - 1 < jointNodes.length) {
      addNodeChild(jointNodes[parentIndex1 - 1], jointNodes[j]);
    }
  }

  const skeleton = createSkeleton3D(jointNodes, undefined, jointNames);

  const jointCount = jointNodes.length;
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
    channels.push(createAnimationChannel(track, { node: jointNodes[j], path: SceneAnimationPathTranslation }));
  }

  const clip = createAnimationClip(channels, timeAccumulator);
  return { clip, skeleton };
}

interface ParsedGeometry {
  geometry: ReturnType<typeof createMeshGeometry>;
}

interface ParsedContainer {
  name: string;
  parentId: number;
  transform: Float64Array;
}

interface ParsedMeshInstance {
  geometryId: number;
  name: string;
  parentId: number;
  transform: Float64Array;
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

    const vertexCount = positions.length / 3;
    const vertices = new Float32Array(vertexCount * CANONICAL_FLOATS_PER_VERTEX);

    for (let v = 0; v < vertexCount; v++) {
      const o = v * CANONICAL_FLOATS_PER_VERTEX;
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
    }

    const indexArray = indices !== null ? Uint32Array.from(indices) : undefined;
    const geometry = createMeshGeometry({ indices: indexArray, layout: CANONICAL_LAYOUT, vertices });
    geometries.push({ geometry });
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
// SceneHeader(parentId → matrix → name) → NumAttrList → geometryId(uint32)
// → numMaterials(uint16) → materialIds(uint32 × N) → UserAttrList
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

  // NumAttrList (block properties).
  offset = skipAwdAttrList(view, offset, end);

  if (offset + 4 > end) {
    warnings?.push('createSceneFromAwd: mesh instance block truncated before geometry ID');
    return null;
  }
  const geometryId = dv.getUint32(offset, true);
  offset += 4;

  if (offset + 2 <= end) {
    const numMaterials = dv.getUint16(offset, true);
    offset += 2;
    offset += numMaterials * 4;
  }

  // UserAttrList.
  offset = skipAwdAttrList(view, offset, end);

  return { geometryId, name: nameResult.value, parentId, transform: transformResult.transform };
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
