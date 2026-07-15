import { createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene, createSceneNode } from '@flighthq/scene';
import type { SceneNode } from '@flighthq/types';

import {
  AWD_BLOCK_CONTAINER,
  AWD_BLOCK_HEADER_BYTES,
  AWD_BLOCK_MESH_INSTANCE,
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
  AWD_MAGIC_3,
  AWD_NAMESPACE_CORE,
  AWD_STREAM_INDICES,
  AWD_STREAM_NORMALS,
  AWD_STREAM_POSITIONS,
  AWD_STREAM_TANGENTS,
  AWD_STREAM_UVS,
} from './awdSchema';
import { CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT } from './shared';

// Parses an Away3D AWD binary file into a Scene. The 12-byte header (magic `AWD\0`, version,
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

  if (
    source[0] !== AWD_MAGIC_0 ||
    source[1] !== AWD_MAGIC_1 ||
    source[2] !== AWD_MAGIC_2 ||
    source[3] !== AWD_MAGIC_3
  ) {
    warnings?.push("createSceneFromAwd: magic is not 'AWD\\0'; not an AWD file");
    return createScene();
  }

  const compression = source[7];
  if (compression !== AWD_COMPRESSION_NONE) {
    warnings?.push(
      `createSceneFromAwd: compression method ${compression} is not supported; only uncompressed AWD is supported`,
    );
    return createScene();
  }

  const flags = view.getUint16(5, true);
  const wideAttributes = (flags & 1) !== 0;

  const bodyLength = view.getUint32(8, true);
  const bodyEnd = Math.min(AWD_HEADER_BYTES + bodyLength, source.byteLength);

  // First pass: parse all blocks into a block map keyed by block ID.
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

    const widePrecision = (blockFlags & 1) !== 0;

    if (namespace === AWD_NAMESPACE_CORE) {
      if (blockType === AWD_BLOCK_TRIANGLE_GEOMETRY) {
        const geoms = parseTriangleGeometryBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          widePrecision,
          wideAttributes,
          warnings,
        );
        geometryBlocks.set(blockId, geoms);
      } else if (blockType === AWD_BLOCK_CONTAINER) {
        const container = parseContainerBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          widePrecision,
          warnings,
        );
        if (container !== null) containerBlocks.set(blockId, container);
      } else if (blockType === AWD_BLOCK_MESH_INSTANCE) {
        const meshInst = parseMeshInstanceBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          widePrecision,
          warnings,
        );
        if (meshInst !== null) meshInstanceBlocks.set(blockId, meshInst);
      }
    }

    offset = blockDataStart + blockLength;
  }

  // Second pass: build scene nodes from containers and mesh instances, then wire up hierarchy.
  const scene = createScene();
  const sceneNodes = new Map<number, SceneNode>();

  // Create container nodes.
  for (const [blockId, container] of containerBlocks) {
    const node = createSceneNode(undefined, { name: container.name || undefined });
    applyAwdTransform(node, container.transform);
    sceneNodes.set(blockId, node);
  }

  // Create mesh instance nodes.
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

  // Wire up parent-child relationships. Blocks with parentId 0 are scene roots.
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

  // Add root-level nodes to the scene.
  for (const [blockId, node] of sceneNodes) {
    if (!parented.has(blockId)) {
      addNodeChild(scene, node);
    }
  }

  return scene;
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

// Reads an AWD string: a uint16 length prefix followed by that many UTF-8 bytes.
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

// Reads a 4x3 column-major transform matrix (12 float values). The float size depends on the
// block's wide-precision flag: float32 (4 bytes each) or float64 (8 bytes each).
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

// Applies a 4x3 AWD column-major transform to a scene node's 4x4 local matrix. AWD stores
// transforms as 12 floats in column-major order: columns [c0x,c0y,c0z, c1x,c1y,c1z,
// c2x,c2y,c2z, tx,ty,tz]. This maps to the 4x4 column-major matrix with w-column [0,0,0,1].
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

// Returns the byte size of one element for an AWD data type constant.
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
      return 4;
    case AWD_DATA_FLOAT32:
      return 4;
    case AWD_DATA_FLOAT64:
      return 8;
    default:
      return 4;
  }
}

// Reads a single numeric value from the DataView according to the AWD data type.
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

// Parses a TriangleGeometry block (type 1). Contains one or more sub-meshes, each with typed
// attribute streams (positions, indices, UVs, normals, tangents).
function parseTriangleGeometryBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  widePrecision: boolean,
  wideAttributes: boolean,
  warnings?: string[],
): ParsedGeometry[] {
  const dv = view as DataView;
  let offset = start;

  // Skip the geometry name (AWD string).
  if (offset + 2 > end) return [];
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  // Number of sub-meshes.
  if (offset + 2 > end) return [];
  const numSubMeshes = dv.getUint16(offset, true);
  offset += 2;

  // Skip geometry-level properties (AWD property list).
  offset = skipAwdProperties(dv, offset, end, wideAttributes);

  const geometries: ParsedGeometry[] = [];

  for (let s = 0; s < numSubMeshes; s++) {
    if (offset + 4 > end) break;
    const numStreams = dv.getUint32(offset, true);
    offset += 4;

    let positions: number[] | null = null;
    let indices: number[] | null = null;
    let uvs: number[] | null = null;
    let normals: number[] | null = null;
    let tangents: number[] | null = null;

    for (let st = 0; st < numStreams; st++) {
      if (offset + 6 > end) break;
      const streamType = dv.getUint8(offset);
      offset += 1;
      const dataType = dv.getUint8(offset);
      offset += 1;
      const count = dv.getUint32(offset, true);
      offset += 4;

      const elementSize = awdDataTypeByteSize(dataType);
      const streamByteLength = count * elementSize;
      if (offset + streamByteLength > end) {
        warnings?.push('createSceneFromAwd: stream data runs past the end of the block');
        break;
      }

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

    // Skip sub-mesh-level properties.
    offset = skipAwdProperties(dv, offset, end, wideAttributes);

    if (positions === null || positions.length < 3) {
      warnings?.push('createSceneFromAwd: sub-mesh has no positions or fewer than 3 position values');
      continue;
    }

    const vertexCount = positions.length / 3;
    const vertices = new Float32Array(vertexCount * CANONICAL_FLOATS_PER_VERTEX);

    for (let v = 0; v < vertexCount; v++) {
      const o = v * CANONICAL_FLOATS_PER_VERTEX;
      // Position (3 floats).
      vertices[o] = positions[v * 3];
      vertices[o + 1] = positions[v * 3 + 1];
      vertices[o + 2] = positions[v * 3 + 2];

      // Normal (3 floats).
      if (normals !== null && v * 3 + 2 < normals.length) {
        vertices[o + 3] = normals[v * 3];
        vertices[o + 4] = normals[v * 3 + 1];
        vertices[o + 5] = normals[v * 3 + 2];
      }

      // Tangent (4 floats) — AWD tangents are 3-component; the handedness w is zero-filled.
      if (tangents !== null && v * 3 + 2 < tangents.length) {
        vertices[o + 6] = tangents[v * 3];
        vertices[o + 7] = tangents[v * 3 + 1];
        vertices[o + 8] = tangents[v * 3 + 2];
      }

      // UV (2 floats).
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

// Parses a Container block (type 22): name, parent ID, and transform.
function parseContainerBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  widePrecision: boolean,
  warnings?: string[],
): ParsedContainer | null {
  let offset = start;

  // Name.
  if (offset + 2 > end) {
    warnings?.push('createSceneFromAwd: container block truncated before name');
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  // Parent ID.
  if (offset + 4 > end) {
    warnings?.push('createSceneFromAwd: container block truncated before parent ID');
    return null;
  }
  const parentId = (view as DataView).getUint32(offset, true);
  offset += 4;

  // Transform (12 floats).
  const floatSize = widePrecision ? 8 : 4;
  if (offset + 12 * floatSize > end) {
    warnings?.push('createSceneFromAwd: container block truncated before transform');
    return null;
  }
  const transformResult = readAwdTransform(view, offset, widePrecision);

  return { name: nameResult.value, parentId, transform: transformResult.transform };
}

// Parses a MeshInstance block (type 23): name, parent ID, transform, and geometry reference.
function parseMeshInstanceBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  widePrecision: boolean,
  warnings?: string[],
): ParsedMeshInstance | null {
  let offset = start;

  // Name.
  if (offset + 2 > end) {
    warnings?.push('createSceneFromAwd: mesh instance block truncated before name');
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  // Parent ID.
  if (offset + 4 > end) {
    warnings?.push('createSceneFromAwd: mesh instance block truncated before parent ID');
    return null;
  }
  const parentId = (view as DataView).getUint32(offset, true);
  offset += 4;

  // Transform (12 floats).
  const floatSize = widePrecision ? 8 : 4;
  if (offset + 12 * floatSize > end) {
    warnings?.push('createSceneFromAwd: mesh instance block truncated before transform');
    return null;
  }
  const transformResult = readAwdTransform(view, offset, widePrecision);
  offset = transformResult.end;

  // Geometry ID.
  if (offset + 4 > end) {
    warnings?.push('createSceneFromAwd: mesh instance block truncated before geometry ID');
    return null;
  }
  const geometryId = (view as DataView).getUint32(offset, true);
  offset += 4;

  // Number of materials and material IDs (skipped — materials are not yet imported).
  if (offset + 2 <= end) {
    const numMaterials = (view as DataView).getUint16(offset, true);
    offset += 2;
    offset += numMaterials * 4; // skip material IDs
  }

  return { geometryId, name: nameResult.value, parentId, transform: transformResult.transform };
}

// Skips an AWD property list. Properties are encoded as a sequence of entries: key (uint16 or
// uint32, depending on wideAttributes) + length (uint32) + data bytes. The list ends when a
// key of 0 is encountered, which also has a zero length and no data.
function skipAwdProperties(view: Readonly<DataView>, offset: number, end: number, wideAttributes: boolean): number {
  const dv = view as DataView;
  const keySize = wideAttributes ? 4 : 2;
  while (offset + keySize + 4 <= end) {
    const key = wideAttributes ? dv.getUint32(offset, true) : dv.getUint16(offset, true);
    offset += keySize;
    const propLength = dv.getUint32(offset, true);
    offset += 4;
    if (key === 0) break;
    offset += propLength;
  }
  return offset;
}
