import {
  getMeshGeometryIndexCount,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh';
import { getNodeChildren } from '@flighthq/node';
import { isMesh } from '@flighthq/scene';
import type { Mesh, SceneNode } from '@flighthq/types';

import { createSceneFromAwd } from './awdParse';
import {
  AWD_BLOCK_CONTAINER,
  AWD_BLOCK_MESH_INSTANCE,
  AWD_BLOCK_TRIANGLE_GEOMETRY,
  AWD_COMPRESSION_DEFLATE,
  AWD_DATA_FLOAT32,
  AWD_DATA_UINT16,
  AWD_NAMESPACE_CORE,
  AWD_STREAM_INDICES,
  AWD_STREAM_NORMALS,
  AWD_STREAM_POSITIONS,
  AWD_STREAM_UVS,
} from './awdSchema';

// Builds a minimal AWD file header. Returns 12 bytes.
function buildAwdHeader(bodyLength: number, compression = 0, flags = 0): Uint8Array {
  const header = new Uint8Array(12);
  const view = new DataView(header.buffer);
  header[0] = 0x41; // 'A'
  header[1] = 0x57; // 'W'
  header[2] = 0x44; // 'D'
  header[3] = 0x00; // '\0'
  header[4] = 2; // version major
  header[5] = 1; // version minor (least significant byte of flags overlaps — see below)
  view.setUint16(5, flags, true); // flags (little-endian)
  header[7] = compression;
  view.setUint32(8, bodyLength, true);
  return header;
}

// Builds a block header (11 bytes): blockId(4) + namespace(1) + blockType(1) + flags(1) + blockLength(4).
function buildBlockHeader(
  blockId: number,
  blockType: number,
  blockLength: number,
  blockFlags = 0,
  namespace = AWD_NAMESPACE_CORE,
): Uint8Array {
  const header = new Uint8Array(11);
  const view = new DataView(header.buffer);
  view.setUint32(0, blockId, true);
  header[4] = namespace;
  header[5] = blockType;
  header[6] = blockFlags;
  view.setUint32(7, blockLength, true);
  return header;
}

// Builds an AWD string: uint16 length + UTF-8 bytes.
function buildAwdString(s: string): Uint8Array {
  const encoded = new TextEncoder().encode(s);
  const result = new Uint8Array(2 + encoded.length);
  const view = new DataView(result.buffer);
  view.setUint16(0, encoded.length, true);
  result.set(encoded, 2);
  return result;
}

// Builds a property list terminator (key=0, length=0). Uses narrow (uint16) keys by default.
function buildEmptyProperties(wide = false): Uint8Array {
  const keySize = wide ? 4 : 2;
  const result = new Uint8Array(keySize + 4);
  // All zeros — key=0 signals end of properties, length=0.
  return result;
}

// Builds an attribute stream: streamType(1) + dataType(1) + count(4) + data.
function buildStream(streamType: number, dataType: number, data: ArrayBufferView): Uint8Array {
  const elementSize = dataType === AWD_DATA_FLOAT32 ? 4 : dataType === AWD_DATA_UINT16 ? 2 : 4;
  const count = data.byteLength / elementSize;
  const result = new Uint8Array(6 + data.byteLength);
  const view = new DataView(result.buffer);
  result[0] = streamType;
  result[1] = dataType;
  view.setUint32(2, count, true);
  result.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), 6);
  return result;
}

// Builds a TriangleGeometry block body: name + numSubMeshes + properties + [sub-mesh data].
// Each sub-mesh: numStreams(4) + streams + properties.
function buildTriangleGeometryBody(name: string, subMeshes: Array<{ streams: Uint8Array[] }>): Uint8Array {
  const nameBytes = buildAwdString(name);
  const numSubMeshesBytes = new Uint8Array(2);
  const numSubMeshesView = new DataView(numSubMeshesBytes.buffer);
  numSubMeshesView.setUint16(0, subMeshes.length, true);
  const props = buildEmptyProperties();

  const parts: Uint8Array[] = [nameBytes, numSubMeshesBytes, props];

  for (const subMesh of subMeshes) {
    const numStreamsBytes = new Uint8Array(4);
    const numStreamsView = new DataView(numStreamsBytes.buffer);
    numStreamsView.setUint32(0, subMesh.streams.length, true);
    parts.push(numStreamsBytes);
    for (const stream of subMesh.streams) {
      parts.push(stream);
    }
    parts.push(buildEmptyProperties());
  }

  return concatBytes(...parts);
}

// Builds a Container or MeshInstance block body: name + parentId(4) + transform(12*4 floats).
// For MeshInstance, also adds geometryId(4) + numMaterials(2).
function buildContainerBody(name: string, parentId: number, transform: number[]): Uint8Array {
  const nameBytes = buildAwdString(name);
  const result = new Uint8Array(nameBytes.length + 4 + 12 * 4);
  const view = new DataView(result.buffer);
  result.set(nameBytes, 0);
  let offset = nameBytes.length;
  view.setUint32(offset, parentId, true);
  offset += 4;
  for (let i = 0; i < 12; i++) {
    view.setFloat32(offset + i * 4, transform[i] ?? 0, true);
  }
  return result;
}

function buildMeshInstanceBody(name: string, parentId: number, transform: number[], geometryId: number): Uint8Array {
  const containerBody = buildContainerBody(name, parentId, transform);
  const extra = new Uint8Array(4 + 2);
  const view = new DataView(extra.buffer);
  view.setUint32(0, geometryId, true);
  view.setUint16(4, 0, true); // numMaterials = 0
  return concatBytes(containerBody, extra);
}

function concatBytes(...arrays: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrays) total += a.length;
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

// Identity transform: 4x3 column-major = [1,0,0, 0,1,0, 0,0,1, 0,0,0].
const IDENTITY_TRANSFORM = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

describe('createSceneFromAwd', () => {
  it('parses a single triangle with positions and indices', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint16Array([0, 1, 2]);

    const posStream = buildStream(AWD_STREAM_POSITIONS, AWD_DATA_FLOAT32, positions);
    const idxStream = buildStream(AWD_STREAM_INDICES, AWD_DATA_UINT16, indices);
    const geomBody = buildTriangleGeometryBody('Triangle', [{ streams: [posStream, idxStream] }]);
    const geomBlockHeader = buildBlockHeader(1, AWD_BLOCK_TRIANGLE_GEOMETRY, geomBody.length);

    const meshBody = buildMeshInstanceBody('TriMesh', 0, IDENTITY_TRANSFORM, 1);
    const meshBlockHeader = buildBlockHeader(2, AWD_BLOCK_MESH_INSTANCE, meshBody.length);

    const body = concatBytes(geomBlockHeader, geomBody, meshBlockHeader, meshBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const scene = createSceneFromAwd(awd);
    const children = getNodeChildren(scene);
    expect(children).toHaveLength(1);
    expect(isMesh(children[0] as SceneNode)).toBe(true);

    const geometry = (children[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    expect(getMeshGeometryIndexCount(geometry)).toBe(3);

    const p = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 0);
    expect([p.x, p.y, p.z]).toEqual([0, 0, 0]);
    getMeshGeometryVertexPosition(p, geometry, 1);
    expect([p.x, p.y, p.z]).toEqual([1, 0, 0]);
    getMeshGeometryVertexPosition(p, geometry, 2);
    expect([p.x, p.y, p.z]).toEqual([0, 1, 0]);
  });

  it('parses geometry with UVs and normals', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const uvs = new Float32Array([0, 0, 1, 0, 0.5, 1]);
    const indices = new Uint16Array([0, 1, 2]);

    const posStream = buildStream(AWD_STREAM_POSITIONS, AWD_DATA_FLOAT32, positions);
    const normStream = buildStream(AWD_STREAM_NORMALS, AWD_DATA_FLOAT32, normals);
    const uvStream = buildStream(AWD_STREAM_UVS, AWD_DATA_FLOAT32, uvs);
    const idxStream = buildStream(AWD_STREAM_INDICES, AWD_DATA_UINT16, indices);
    const geomBody = buildTriangleGeometryBody('Geom', [{ streams: [posStream, normStream, uvStream, idxStream] }]);
    const geomBlockHeader = buildBlockHeader(1, AWD_BLOCK_TRIANGLE_GEOMETRY, geomBody.length);

    const meshBody = buildMeshInstanceBody('Mesh', 0, IDENTITY_TRANSFORM, 1);
    const meshBlockHeader = buildBlockHeader(2, AWD_BLOCK_MESH_INSTANCE, meshBody.length);

    const body = concatBytes(geomBlockHeader, geomBody, meshBlockHeader, meshBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const scene = createSceneFromAwd(awd);
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;

    const n = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexNormal(n, geometry, 0);
    expect([n.x, n.y, n.z]).toEqual([0, 0, 1]);

    const uv = { x: 0, y: 0 };
    getMeshGeometryVertexUv0(uv, geometry, 1);
    expect([uv.x, uv.y]).toEqual([1, 0]);
    getMeshGeometryVertexUv0(uv, geometry, 2);
    expect([uv.x, uv.y]).toEqual([0.5, 1]);
  });

  it('builds container and mesh instance hierarchy', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint16Array([0, 1, 2]);
    const posStream = buildStream(AWD_STREAM_POSITIONS, AWD_DATA_FLOAT32, positions);
    const idxStream = buildStream(AWD_STREAM_INDICES, AWD_DATA_UINT16, indices);
    const geomBody = buildTriangleGeometryBody('Geom', [{ streams: [posStream, idxStream] }]);
    const geomBlockHeader = buildBlockHeader(1, AWD_BLOCK_TRIANGLE_GEOMETRY, geomBody.length);

    // Container block (block ID 2, parent 0 = root).
    const containerBody = buildContainerBody('Group', 0, IDENTITY_TRANSFORM);
    const containerBlockHeader = buildBlockHeader(2, AWD_BLOCK_CONTAINER, containerBody.length);

    // Mesh instance block (block ID 3, parent = block 2).
    const meshBody = buildMeshInstanceBody('ChildMesh', 2, IDENTITY_TRANSFORM, 1);
    const meshBlockHeader = buildBlockHeader(3, AWD_BLOCK_MESH_INSTANCE, meshBody.length);

    const body = concatBytes(geomBlockHeader, geomBody, containerBlockHeader, containerBody, meshBlockHeader, meshBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const scene = createSceneFromAwd(awd);
    const roots = getNodeChildren(scene);
    // One root node (the container).
    expect(roots).toHaveLength(1);
    const container = roots[0] as SceneNode;
    expect(isMesh(container)).toBe(false);

    const containerChildren = getNodeChildren(container);
    expect(containerChildren).toHaveLength(1);
    expect(isMesh(containerChildren[0] as SceneNode)).toBe(true);
  });

  it('warns and returns empty scene for compressed AWD', () => {
    const awd = buildAwdHeader(0, AWD_COMPRESSION_DEFLATE);
    const warnings: string[] = [];
    const scene = createSceneFromAwd(awd, warnings);
    expect(getNodeChildren(scene)).toHaveLength(0);
    expect(warnings.some((w) => w.includes('compression'))).toBe(true);
  });

  it('returns an empty scene and warns for truncated input', () => {
    const warnings: string[] = [];
    const scene = createSceneFromAwd(new Uint8Array(4), warnings);
    expect(getNodeChildren(scene)).toHaveLength(0);
    expect(warnings.some((w) => w.includes('header'))).toBe(true);
  });

  it('returns an empty scene and warns when magic is invalid', () => {
    const bogus = new Uint8Array(12);
    bogus[0] = 0x00;
    const warnings: string[] = [];
    const scene = createSceneFromAwd(bogus, warnings);
    expect(getNodeChildren(scene)).toHaveLength(0);
    expect(warnings.some((w) => w.includes('magic'))).toBe(true);
  });

  it('returns an empty scene for a valid header with no blocks', () => {
    const awd = buildAwdHeader(0);
    const scene = createSceneFromAwd(awd);
    expect(getNodeChildren(scene)).toHaveLength(0);
  });

  it('applies transform from mesh instance block', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint16Array([0, 1, 2]);
    const posStream = buildStream(AWD_STREAM_POSITIONS, AWD_DATA_FLOAT32, positions);
    const idxStream = buildStream(AWD_STREAM_INDICES, AWD_DATA_UINT16, indices);
    const geomBody = buildTriangleGeometryBody('Geom', [{ streams: [posStream, idxStream] }]);
    const geomBlockHeader = buildBlockHeader(1, AWD_BLOCK_TRIANGLE_GEOMETRY, geomBody.length);

    // Transform with translation (10, 20, 30): identity rotation columns + translation.
    const transform = [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 20, 30];
    const meshBody = buildMeshInstanceBody('Mesh', 0, transform, 1);
    const meshBlockHeader = buildBlockHeader(2, AWD_BLOCK_MESH_INSTANCE, meshBody.length);

    const body = concatBytes(geomBlockHeader, geomBody, meshBlockHeader, meshBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const scene = createSceneFromAwd(awd);
    const meshNode = getNodeChildren(scene)[0] as SceneNode;
    const m = meshNode.localMatrix.m;
    expect(m[12]).toBeCloseTo(10);
    expect(m[13]).toBeCloseTo(20);
    expect(m[14]).toBeCloseTo(30);
    expect(m[0]).toBeCloseTo(1);
    expect(m[5]).toBeCloseTo(1);
    expect(m[10]).toBeCloseTo(1);
  });

  it('warns when block length runs past the end of the body', () => {
    // Create a block header that declares a length larger than available.
    const blockHeader = buildBlockHeader(1, AWD_BLOCK_TRIANGLE_GEOMETRY, 9999);
    const body = blockHeader;
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const warnings: string[] = [];
    createSceneFromAwd(awd, warnings);
    expect(warnings.some((w) => w.includes('block length'))).toBe(true);
  });

  it('warns when mesh instance references a nonexistent geometry block', () => {
    const meshBody = buildMeshInstanceBody('Mesh', 0, IDENTITY_TRANSFORM, 99);
    const meshBlockHeader = buildBlockHeader(1, AWD_BLOCK_MESH_INSTANCE, meshBody.length);

    const body = concatBytes(meshBlockHeader, meshBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const warnings: string[] = [];
    const scene = createSceneFromAwd(awd, warnings);
    // A scene node is created even without geometry.
    expect(getNodeChildren(scene)).toHaveLength(1);
    expect(warnings.some((w) => w.includes('geometry block 99'))).toBe(true);
  });

  it('parses positions-only geometry without indices', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const posStream = buildStream(AWD_STREAM_POSITIONS, AWD_DATA_FLOAT32, positions);
    const geomBody = buildTriangleGeometryBody('NoIdx', [{ streams: [posStream] }]);
    const geomBlockHeader = buildBlockHeader(1, AWD_BLOCK_TRIANGLE_GEOMETRY, geomBody.length);

    const meshBody = buildMeshInstanceBody('Mesh', 0, IDENTITY_TRANSFORM, 1);
    const meshBlockHeader = buildBlockHeader(2, AWD_BLOCK_MESH_INSTANCE, meshBody.length);

    const body = concatBytes(geomBlockHeader, geomBody, meshBlockHeader, meshBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const scene = createSceneFromAwd(awd);
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
  });
});
