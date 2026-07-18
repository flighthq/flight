import { sampleAnimationTrack } from '@flighthq/animation';
import {
  getMeshGeometryIndexCount,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh';
import { getNodeChildren, getNodeParent } from '@flighthq/node';
import { createSceneNode, isMesh } from '@flighthq/scene';
import type {
  EmbeddedSceneResourceRef,
  ExternalSceneResourceRef,
  Mesh,
  SceneAnimationTarget,
  SceneNode,
  StandardPbrMaterial,
  UnlitMaterial,
} from '@flighthq/types';
import { ResourceResolutionState, StandardPbrMaterialKind, UnlitMaterialKind } from '@flighthq/types';

import { createSceneFromAwd, parseAwdSkeletonAnimation } from './awdParse';
import {
  AWD_BLOCK_CONTAINER,
  AWD_BLOCK_MATERIAL,
  AWD_BLOCK_MESH_INSTANCE,
  AWD_BLOCK_SKELETON,
  AWD_BLOCK_SKELETON_ANIMATION,
  AWD_BLOCK_SKELETON_POSE,
  AWD_BLOCK_TEXTURE,
  AWD_BLOCK_TRIANGLE_GEOMETRY,
  AWD_COMPRESSION_DEFLATE,
  AWD_DATA_FLOAT32,
  AWD_DATA_UINT16,
  AWD_MATERIAL_PROP_COLOR,
  AWD_MATERIAL_PROP_DIFFUSE_TEXTURE,
  AWD_MATERIAL_TYPE_COLOR,
  AWD_MATERIAL_TYPE_TEXTURE,
  AWD_NAMESPACE_CORE,
  AWD_STREAM_INDICES,
  AWD_STREAM_JOINT_INDICES,
  AWD_STREAM_JOINT_WEIGHTS,
  AWD_STREAM_NORMALS,
  AWD_STREAM_POSITIONS,
  AWD_STREAM_UVS,
  AWD_TEXTURE_TYPE_EMBEDDED,
  AWD_TEXTURE_TYPE_EXTERNAL,
} from './awdSchema';

function buildAwdHeader(bodyLength: number, compression = 0, flags = 0): Uint8Array {
  const header = new Uint8Array(12);
  const view = new DataView(header.buffer);
  header[0] = 0x41; // 'A'
  header[1] = 0x57; // 'W'
  header[2] = 0x44; // 'D'
  header[3] = 2; // version major
  header[4] = 1; // version minor
  view.setUint16(5, flags, true);
  header[7] = compression;
  view.setUint32(8, bodyLength, true);
  return header;
}

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

function buildAwdString(s: string): Uint8Array {
  const encoded = new TextEncoder().encode(s);
  const result = new Uint8Array(2 + encoded.length);
  const view = new DataView(result.buffer);
  view.setUint16(0, encoded.length, true);
  result.set(encoded, 2);
  return result;
}

// Builds an empty attribute list: uint32(0) byte-length prefix = 4 bytes.
function buildEmptyAttrList(): Uint8Array {
  return new Uint8Array(4);
}

// Builds an attribute stream: streamType(1) + dataType(1) + byteLength(4) + data.
function buildStream(streamType: number, dataType: number, data: ArrayBufferView): Uint8Array {
  const result = new Uint8Array(6 + data.byteLength);
  const view = new DataView(result.buffer);
  result[0] = streamType;
  result[1] = dataType;
  view.setUint32(2, data.byteLength, true);
  result.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), 6);
  return result;
}

// Sub-mesh layout: totalByteLen(uint32) → NumAttrList → streams → UserAttrList
function buildTriangleGeometryBody(name: string, subMeshes: Array<{ streams: Uint8Array[] }>): Uint8Array {
  const nameBytes = buildAwdString(name);
  const numSubMeshesBytes = new Uint8Array(2);
  new DataView(numSubMeshesBytes.buffer).setUint16(0, subMeshes.length, true);
  const geoAttrList = buildEmptyAttrList();

  const parts: Uint8Array[] = [nameBytes, numSubMeshesBytes, geoAttrList];

  for (const subMesh of subMeshes) {
    const subAttrList = buildEmptyAttrList();
    const userAttrList = buildEmptyAttrList();

    let streamsSize = 0;
    for (const stream of subMesh.streams) streamsSize += stream.length;
    const totalByteLen = subAttrList.length + streamsSize + userAttrList.length;

    const lenBytes = new Uint8Array(4);
    new DataView(lenBytes.buffer).setUint32(0, totalByteLen, true);

    parts.push(lenBytes, subAttrList);
    for (const stream of subMesh.streams) parts.push(stream);
    parts.push(userAttrList);
  }

  return concatBytes(...parts);
}

// SceneHeader layout: parentId(uint32) → matrix4x3(12×float32) → name(VarString)
// Container adds: NumAttrList → UserAttrList
function buildContainerBody(name: string, parentId: number, transform: number[]): Uint8Array {
  const nameBytes = buildAwdString(name);
  const numAttrList = buildEmptyAttrList();
  const userAttrList = buildEmptyAttrList();
  const result = new Uint8Array(4 + 12 * 4 + nameBytes.length + numAttrList.length + userAttrList.length);
  const view = new DataView(result.buffer);
  let offset = 0;
  view.setUint32(offset, parentId, true);
  offset += 4;
  for (let i = 0; i < 12; i++) {
    view.setFloat32(offset + i * 4, transform[i] ?? 0, true);
  }
  offset += 12 * 4;
  result.set(nameBytes, offset);
  offset += nameBytes.length;
  result.set(numAttrList, offset);
  offset += numAttrList.length;
  result.set(userAttrList, offset);
  return result;
}

// MeshInstance layout: SceneHeader → geometryId(uint32) → numMaterials(uint16) → materialIds → NumAttrList → UserAttrList
function buildMeshInstanceBody(name: string, parentId: number, transform: number[], geometryId: number): Uint8Array {
  const nameBytes = buildAwdString(name);
  const numAttrList = buildEmptyAttrList();
  const userAttrList = buildEmptyAttrList();
  const result = new Uint8Array(4 + 12 * 4 + nameBytes.length + 4 + 2 + numAttrList.length + userAttrList.length);
  const view = new DataView(result.buffer);
  let offset = 0;
  view.setUint32(offset, parentId, true);
  offset += 4;
  for (let i = 0; i < 12; i++) {
    view.setFloat32(offset + i * 4, transform[i] ?? 0, true);
  }
  offset += 12 * 4;
  result.set(nameBytes, offset);
  offset += nameBytes.length;
  view.setUint32(offset, geometryId, true);
  offset += 4;
  view.setUint16(offset, 0, true);
  offset += 2;
  result.set(numAttrList, offset);
  offset += numAttrList.length;
  result.set(userAttrList, offset);
  return result;
}

// MeshInstance with a material id per subset (numMaterials > 0), unlike buildMeshInstanceBody.
function buildMeshInstanceBodyWithMaterials(
  name: string,
  parentId: number,
  transform: number[],
  geometryId: number,
  materialIds: number[],
): Uint8Array {
  const nameBytes = buildAwdString(name);
  const head = new Uint8Array(4 + 12 * 4 + nameBytes.length + 4);
  const view = new DataView(head.buffer);
  let offset = 0;
  view.setUint32(offset, parentId, true);
  offset += 4;
  for (let i = 0; i < 12; i++) view.setFloat32(offset + i * 4, transform[i] ?? 0, true);
  offset += 12 * 4;
  head.set(nameBytes, offset);
  offset += nameBytes.length;
  view.setUint32(offset, geometryId, true);

  const mats = new Uint8Array(2 + materialIds.length * 4);
  const mv = new DataView(mats.buffer);
  mv.setUint16(0, materialIds.length, true);
  for (let i = 0; i < materialIds.length; i++) mv.setUint32(2 + i * 4, materialIds[i], true);

  return concatBytes(head, mats, buildEmptyAttrList(), buildEmptyAttrList());
}

// Material layout: name(VarString) → matType(uint8) → numMethods(uint8) → PropertyList → UserAttrList.
// Each property here is a uint32 value (key, value) — enough for the diffuse-texture and color keys.
function buildMaterialBody(name: string, matType: number, props: Array<[number, number]>): Uint8Array {
  const nameBytes = buildAwdString(name);
  const recordSize = 2 + 4 + 4; // key(uint16) + fieldLength(uint32) + value(uint32)
  const propList = new Uint8Array(4 + props.length * recordSize);
  const pv = new DataView(propList.buffer);
  pv.setUint32(0, props.length * recordSize, true);
  let o = 4;
  for (const [key, value] of props) {
    pv.setUint16(o, key, true);
    o += 2;
    pv.setUint32(o, 4, true);
    o += 4;
    pv.setUint32(o, value, true);
    o += 4;
  }
  return concatBytes(nameBytes, new Uint8Array([matType, 0]), propList, buildEmptyAttrList());
}

// Texture layout: name(VarString) → texType(uint8) → dataLen(uint32) → data → PropertyList → UserAttrList.
function buildTextureBody(name: string, texType: number, imageBytes: Uint8Array): Uint8Array {
  const nameBytes = buildAwdString(name);
  const head = new Uint8Array(1 + 4);
  head[0] = texType;
  new DataView(head.buffer).setUint32(1, imageBytes.length, true);
  return concatBytes(nameBytes, head, imageBytes, buildEmptyAttrList(), buildEmptyAttrList());
}

// A 4-byte PNG signature — enough for detectImageMimeType to type the payload 'image/png'. The
// bytes never reach a decoder in these tests (none is registered), so a full image is unnecessary.
const FAKE_PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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

const IDENTITY_TRANSFORM = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

// A complete skinned AWD: a 3-vertex sub-mesh with joint-index/weight streams (2 influences/vertex),
// a 2-joint skeleton, a mesh instance, and a two-pose translation animation — enough to exercise the
// full skin path (joints0/weights0 emit, mesh.skin binding) and the anim→skin identity. The joint
// index stream declares float32 in its header (as real AWD exporters do) but is packed as uint16.
const SKINNED_TRIANGLE_AWD = (() => {
  const posStream = buildStream(AWD_STREAM_POSITIONS, AWD_DATA_FLOAT32, new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const idxStream = buildStream(AWD_STREAM_INDICES, AWD_DATA_UINT16, new Uint16Array([0, 1, 2]));
  const jointIndexStream = buildStream(AWD_STREAM_JOINT_INDICES, AWD_DATA_FLOAT32, new Uint16Array([0, 1, 0, 1, 1, 0]));
  const jointWeightStream = buildStream(
    AWD_STREAM_JOINT_WEIGHTS,
    AWD_DATA_FLOAT32,
    new Float32Array([0.75, 0.25, 0.5, 0.5, 1, 0]),
  );
  const geomBody = buildTriangleGeometryBody('Skinned', [
    { streams: [posStream, idxStream, jointIndexStream, jointWeightStream] },
  ]);
  const skelBody = buildSkeletonBody('Rig', [
    { name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    { name: 'Child', parentIndex: 1, transform: [1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 0, 0] },
  ]);
  const miBody = buildMeshInstanceBody('SkinnedMesh', 0, IDENTITY_TRANSFORM, 1);
  const pose0Body = buildSkeletonPoseBody('P0', [IDENTITY_TRANSFORM, IDENTITY_TRANSFORM]);
  const pose1Body = buildSkeletonPoseBody('P1', [
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 0, 0],
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0],
  ]);
  const animBody = buildSkeletonAnimationBody('Walk', [
    { duration: 500, poseBlockId: 5 },
    { duration: 500, poseBlockId: 6 },
  ]);

  const body = concatBytes(
    buildBlockHeader(1, AWD_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
    geomBody,
    buildBlockHeader(2, AWD_BLOCK_SKELETON, skelBody.length),
    skelBody,
    buildBlockHeader(3, AWD_BLOCK_MESH_INSTANCE, miBody.length),
    miBody,
    buildBlockHeader(5, AWD_BLOCK_SKELETON_POSE, pose0Body.length),
    pose0Body,
    buildBlockHeader(6, AWD_BLOCK_SKELETON_POSE, pose1Body.length),
    pose1Body,
    buildBlockHeader(7, AWD_BLOCK_SKELETON_ANIMATION, animBody.length),
    animBody,
  );
  return concatBytes(buildAwdHeader(body.length), body);
})();

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
    expect((children[0] as SceneNode).name).toBe('TriMesh');

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
    expect([n.x, n.y, n.z]).toEqual([0, 0, -1]);

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

    const containerBody = buildContainerBody('Group', 0, IDENTITY_TRANSFORM);
    const containerBlockHeader = buildBlockHeader(2, AWD_BLOCK_CONTAINER, containerBody.length);

    const meshBody = buildMeshInstanceBody('ChildMesh', 2, IDENTITY_TRANSFORM, 1);
    const meshBlockHeader = buildBlockHeader(3, AWD_BLOCK_MESH_INSTANCE, meshBody.length);

    const body = concatBytes(geomBlockHeader, geomBody, containerBlockHeader, containerBody, meshBlockHeader, meshBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const scene = createSceneFromAwd(awd);
    const roots = getNodeChildren(scene);
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
    expect(m[14]).toBeCloseTo(-30);
    expect(m[0]).toBeCloseTo(1);
    expect(m[5]).toBeCloseTo(1);
    expect(m[10]).toBeCloseTo(1);
  });

  it('warns when block length runs past the end of the body', () => {
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

  it('attaches a textured StandardPbrMaterial from a material + embedded texture block', () => {
    const posStream = buildStream(
      AWD_STREAM_POSITIONS,
      AWD_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD_STREAM_INDICES, AWD_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
    const texBody = buildTextureBody('diffuse.png', AWD_TEXTURE_TYPE_EMBEDDED, FAKE_PNG_BYTES);
    const matBody = buildMaterialBody('Mat', AWD_MATERIAL_TYPE_TEXTURE, [[AWD_MATERIAL_PROP_DIFFUSE_TEXTURE, 2]]);
    const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [3]);

    const body = concatBytes(
      buildBlockHeader(1, AWD_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD_BLOCK_TEXTURE, texBody.length),
      texBody,
      buildBlockHeader(3, AWD_BLOCK_MATERIAL, matBody.length),
      matBody,
      buildBlockHeader(4, AWD_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const warnings: string[] = [];
    const scene = createSceneFromAwd(concatBytes(buildAwdHeader(body.length), body), warnings);

    const mesh = getNodeChildren(scene)[0] as Mesh;
    expect(isMesh(mesh)).toBe(true);
    expect(mesh.materials).toHaveLength(1);
    const material = mesh.materials[0] as StandardPbrMaterial | null;
    expect(material).not.toBeNull();
    expect(material!.kind).toBe(StandardPbrMaterialKind);
    expect(material!.baseColorMap).not.toBeNull();
    // The parser references, it does not decode: image stays null, a ref carries the source.
    expect(material!.baseColorMap!.image).toBeNull();
    const ref = material!.baseColorMap!.resource as EmbeddedSceneResourceRef;
    expect(ref.kind).toBe('Embedded');
    expect(ref.mimeType).toBe('image/png');
    expect(ref.bytes).toEqual(FAKE_PNG_BYTES);
    expect(ref.state).toBe(ResourceResolutionState.Unresolved);
    expect(warnings).toHaveLength(0);
  });

  it('attaches an UnlitMaterial from a flat-color material block, widening color to opaque rgba', () => {
    const posStream = buildStream(
      AWD_STREAM_POSITIONS,
      AWD_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD_STREAM_INDICES, AWD_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
    const matBody = buildMaterialBody('ColorMat', AWD_MATERIAL_TYPE_COLOR, [[AWD_MATERIAL_PROP_COLOR, 0x336699]]);
    const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [2]);

    const body = concatBytes(
      buildBlockHeader(1, AWD_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD_BLOCK_MATERIAL, matBody.length),
      matBody,
      buildBlockHeader(3, AWD_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const scene = createSceneFromAwd(concatBytes(buildAwdHeader(body.length), body));

    const material = (getNodeChildren(scene)[0] as Mesh).materials[0] as UnlitMaterial | null;
    expect(material).not.toBeNull();
    expect(material!.kind).toBe(UnlitMaterialKind);
    expect(material!.baseColor).toBe(0x336699ff);
  });

  it('emits an External SceneResourceRef for an external-URL texture', () => {
    const posStream = buildStream(
      AWD_STREAM_POSITIONS,
      AWD_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD_STREAM_INDICES, AWD_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
    const texBody = buildTextureBody('http://example.com/tex.png', AWD_TEXTURE_TYPE_EXTERNAL, new Uint8Array(0));
    const matBody = buildMaterialBody('Mat', AWD_MATERIAL_TYPE_TEXTURE, [[AWD_MATERIAL_PROP_DIFFUSE_TEXTURE, 2]]);
    const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [3]);

    const body = concatBytes(
      buildBlockHeader(1, AWD_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD_BLOCK_TEXTURE, texBody.length),
      texBody,
      buildBlockHeader(3, AWD_BLOCK_MATERIAL, matBody.length),
      matBody,
      buildBlockHeader(4, AWD_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const warnings: string[] = [];
    const scene = createSceneFromAwd(concatBytes(buildAwdHeader(body.length), body), warnings);

    const material = (getNodeChildren(scene)[0] as Mesh).materials[0] as StandardPbrMaterial;
    expect(material.kind).toBe(StandardPbrMaterialKind);
    expect(material.baseColorMap!.image).toBeNull();
    const ref = material.baseColorMap!.resource as ExternalSceneResourceRef;
    expect(ref.kind).toBe('External');
    expect(ref.uri).toBe('http://example.com/tex.png');
    expect(ref.state).toBe(ResourceResolutionState.Unresolved);
    expect(warnings).toHaveLength(0);
  });

  it('emits one Unresolved ref per shared texture and never decodes during parse', () => {
    const posStream = buildStream(
      AWD_STREAM_POSITIONS,
      AWD_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD_STREAM_INDICES, AWD_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
    const texBody = buildTextureBody('diffuse.png', AWD_TEXTURE_TYPE_EMBEDDED, FAKE_PNG_BYTES);
    const matBody = buildMaterialBody('Mat', AWD_MATERIAL_TYPE_TEXTURE, [[AWD_MATERIAL_PROP_DIFFUSE_TEXTURE, 2]]);
    const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [3]);

    const body = concatBytes(
      buildBlockHeader(1, AWD_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD_BLOCK_TEXTURE, texBody.length),
      texBody,
      buildBlockHeader(3, AWD_BLOCK_MATERIAL, matBody.length),
      matBody,
      buildBlockHeader(4, AWD_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const scene = createSceneFromAwd(concatBytes(buildAwdHeader(body.length), body));

    const texture = ((getNodeChildren(scene)[0] as Mesh).materials[0] as StandardPbrMaterial).baseColorMap!;
    expect(texture.image).toBeNull(); // parse never allocates or fills an ImageResource
    const ref = texture.resource as EmbeddedSceneResourceRef;
    expect(ref.kind).toBe('Embedded');
    expect(ref.bytes).toEqual(FAKE_PNG_BYTES);
    expect(ref.mimeType).toBe('image/png');
    expect(ref.state).toBe(ResourceResolutionState.Unresolved);
  });

  it('emits joints0/weights0 into the skinned layout and binds the skeleton via mesh.skin', () => {
    const scene = createSceneFromAwd(SKINNED_TRIANGLE_AWD);
    const mesh = getNodeChildren(scene).find((c) => isMesh(c as SceneNode)) as unknown as Mesh;
    expect(mesh).toBeTruthy();

    // Skinned records interleave joints0/weights0 past uv0 → 20-float (80-byte) stride.
    expect(mesh.geometry.layout.stride).toBe(80);
    const floatsPerVertex = mesh.geometry.layout.stride / 4;

    // Vertex 0's two influences (joint 0 @ 0.75, joint 1 @ 0.25), highest-weight first.
    expect(mesh.geometry.vertices[12]).toBe(0);
    expect(mesh.geometry.vertices[13]).toBe(1);
    expect(mesh.geometry.vertices[16]).toBeCloseTo(0.75);
    expect(mesh.geometry.vertices[17]).toBeCloseTo(0.25);

    // Every vertex's four weights renormalize to 1 (vertex 2 has a single influence).
    for (let v = 0; v < 3; v++) {
      const base = v * floatsPerVertex;
      const weightSum =
        mesh.geometry.vertices[base + 16] +
        mesh.geometry.vertices[base + 17] +
        mesh.geometry.vertices[base + 18] +
        mesh.geometry.vertices[base + 19];
      expect(weightSum).toBeCloseTo(1);
    }

    expect(mesh.skin).toBeTruthy();
    expect(mesh.skin?.skeleton.joints).toHaveLength(2);
    expect(mesh.skin?.skeleton.names).toEqual(['Root', 'Child']);
    // The skeleton hierarchy hangs under the "skeleton" group added to the scene.
    expect(mesh.skin?.skeletonRoot).toBe(getNodeChildren(scene).find((c) => !isMesh(c as SceneNode)));
    expect(getNodeParent(mesh.skin!.skeleton.joints[1])).toBe(mesh.skin!.skeleton.joints[0]);
  });

  it('binds the animation clip to the same joint nodes the mesh skins from (identity)', () => {
    const scene = createSceneFromAwd(SKINNED_TRIANGLE_AWD);
    const mesh = getNodeChildren(scene).find((c) => isMesh(c as SceneNode)) as unknown as Mesh;
    const joints = mesh.skin!.skeleton.joints;

    // The verify contract: parse the animation over the mesh's own skeleton joints, so posing the
    // clip deforms the skinned mesh — the animation, skeleton, and skin share one joint hierarchy.
    const clip = parseAwdSkeletonAnimation(SKINNED_TRIANGLE_AWD, joints)!;
    expect(clip).not.toBeNull();
    expect(clip.channels).toHaveLength(2);
    expect((clip.channels[0].targetRef as SceneAnimationTarget).node).toBe(joints[0]);
    expect((clip.channels[1].targetRef as SceneAnimationTarget).node).toBe(joints[1]);
  });

  it('leaves a non-skinned mesh with skin null even when the file carries a skeleton', () => {
    const posStream = buildStream(
      AWD_STREAM_POSITIONS,
      AWD_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD_STREAM_INDICES, AWD_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Rigid', [{ streams: [posStream, idxStream] }]);
    const skelBody = buildSkeletonBody('Rig', [{ name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM }]);
    const miBody = buildMeshInstanceBody('RigidMesh', 0, IDENTITY_TRANSFORM, 1);

    const body = concatBytes(
      buildBlockHeader(1, AWD_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD_BLOCK_SKELETON, skelBody.length),
      skelBody,
      buildBlockHeader(3, AWD_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const scene = createSceneFromAwd(concatBytes(buildAwdHeader(body.length), body));
    const mesh = getNodeChildren(scene).find((c) => isMesh(c as SceneNode)) as unknown as Mesh;

    expect(mesh.geometry.layout.stride).toBe(48); // canonical (non-skinned) layout
    expect(mesh.skin == null).toBe(true);
  });
});

// Skeleton block body: name → jointCount(uint16) → NumAttrList → per joint:
//   jointId(uint16) → parentId(uint16, 1-based, 0=root) → name → matrix4x3(float32) → NumAttrList → UserAttrList
function buildSkeletonBody(
  name: string,
  joints: Array<{ name: string; parentIndex: number; transform: number[] }>,
): Uint8Array {
  const parts: Uint8Array[] = [buildAwdString(name)];
  const jointCountBytes = new Uint8Array(2);
  new DataView(jointCountBytes.buffer).setUint16(0, joints.length, true);
  parts.push(jointCountBytes);
  parts.push(buildEmptyAttrList());

  for (let j = 0; j < joints.length; j++) {
    const joint = joints[j];
    const headerBytes = new Uint8Array(4);
    const hv = new DataView(headerBytes.buffer);
    hv.setUint16(0, j, true);
    hv.setUint16(2, joint.parentIndex, true);
    parts.push(headerBytes);
    parts.push(buildAwdString(joint.name));
    const transformBytes = new Uint8Array(12 * 4);
    const transformView = new DataView(transformBytes.buffer);
    for (let i = 0; i < 12; i++) {
      transformView.setFloat32(i * 4, joint.transform[i] ?? 0, true);
    }
    parts.push(transformBytes);
    parts.push(buildEmptyAttrList());
    parts.push(buildEmptyAttrList());
  }

  return concatBytes(...parts);
}

// Skeleton-pose block body: name → jointCount(uint16) → NumAttrList → per joint:
//   hasTransform(uint8) → optional matrix4x3(float32)
function buildSkeletonPoseBody(name: string, jointTransforms: (number[] | null)[]): Uint8Array {
  const parts: Uint8Array[] = [buildAwdString(name)];
  const jointCountBytes = new Uint8Array(2);
  new DataView(jointCountBytes.buffer).setUint16(0, jointTransforms.length, true);
  parts.push(jointCountBytes);
  parts.push(buildEmptyAttrList());

  for (const transform of jointTransforms) {
    if (transform !== null) {
      const flagAndTransform = new Uint8Array(1 + 12 * 4);
      flagAndTransform[0] = 1;
      const tv = new DataView(flagAndTransform.buffer);
      for (let i = 0; i < 12; i++) {
        tv.setFloat32(1 + i * 4, transform[i] ?? 0, true);
      }
      parts.push(flagAndTransform);
    } else {
      parts.push(new Uint8Array([0]));
    }
  }

  return concatBytes(...parts);
}

// Skeleton-animation block body: name → frameCount(uint16) → NumAttrList → per frame:
//   poseBlockId(uint32) → duration(uint16, ms)
function buildSkeletonAnimationBody(name: string, poses: Array<{ duration: number; poseBlockId: number }>): Uint8Array {
  const parts: Uint8Array[] = [buildAwdString(name)];
  const poseCountBytes = new Uint8Array(2);
  new DataView(poseCountBytes.buffer).setUint16(0, poses.length, true);
  parts.push(poseCountBytes);
  parts.push(buildEmptyAttrList());

  for (const pose of poses) {
    const poseBytes = new Uint8Array(6);
    const pv = new DataView(poseBytes.buffer);
    pv.setUint32(0, pose.poseBlockId, true);
    pv.setUint16(4, pose.duration, true);
    parts.push(poseBytes);
  }

  return concatBytes(...parts);
}

describe('parseAwdSkeletonAnimation', () => {
  it('binds channels to the provided joint nodes in skeleton order', () => {
    // parentIndex 0 = root (no parent); parentIndex 1 = parent is joint[0] (1-based).
    const skeletonBody = buildSkeletonBody('TestSkeleton', [
      { name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM },
      { name: 'Child', parentIndex: 1, transform: [1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 0, 0] },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD_BLOCK_SKELETON, skeletonBody.length);

    const pose0Body = buildSkeletonPoseBody('Pose0', [IDENTITY_TRANSFORM, [1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 0, 0]]);
    const pose0Block = buildBlockHeader(2, AWD_BLOCK_SKELETON_POSE, pose0Body.length);

    const pose1Body = buildSkeletonPoseBody('Pose1', [IDENTITY_TRANSFORM, [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 0, 0]]);
    const pose1Block = buildBlockHeader(3, AWD_BLOCK_SKELETON_POSE, pose1Body.length);

    const animBody = buildSkeletonAnimationBody('Walk', [
      { duration: 500, poseBlockId: 2 },
      { duration: 500, poseBlockId: 3 },
    ]);
    const animBlock = buildBlockHeader(4, AWD_BLOCK_SKELETON_ANIMATION, animBody.length);

    const body = concatBytes(
      skeletonBlock,
      skeletonBody,
      pose0Block,
      pose0Body,
      pose1Block,
      pose1Body,
      animBlock,
      animBody,
    );
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const joints = [createSceneNode(), createSceneNode()];
    const clip = parseAwdSkeletonAnimation(awd, joints);
    expect(clip).not.toBeNull();

    expect(clip!.channels).toHaveLength(2);
    expect(clip!.duration).toBeCloseTo(1.0);
    expect((clip!.channels[0].targetRef as SceneAnimationTarget).node).toBe(joints[0]);
    expect((clip!.channels[1].targetRef as SceneAnimationTarget).node).toBe(joints[1]);
  });

  it('samples animation clip translation values correctly', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Joint0', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD_BLOCK_SKELETON, skeletonBody.length);

    const pose0Body = buildSkeletonPoseBody('P0', [[1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]]);
    const pose0Block = buildBlockHeader(2, AWD_BLOCK_SKELETON_POSE, pose0Body.length);

    const pose1Body = buildSkeletonPoseBody('P1', [[1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 20, 30]]);
    const pose1Block = buildBlockHeader(3, AWD_BLOCK_SKELETON_POSE, pose1Body.length);

    const animBody = buildSkeletonAnimationBody('Anim', [
      { duration: 1000, poseBlockId: 2 },
      { duration: 1000, poseBlockId: 3 },
    ]);
    const animBlock = buildBlockHeader(4, AWD_BLOCK_SKELETON_ANIMATION, animBody.length);

    const body = concatBytes(
      skeletonBlock,
      skeletonBody,
      pose0Block,
      pose0Body,
      pose1Block,
      pose1Body,
      animBlock,
      animBody,
    );
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const clip = parseAwdSkeletonAnimation(awd, [createSceneNode()])!;
    const track = clip.channels[0].track;

    const out = [0, 0, 0];
    sampleAnimationTrack(out, track, 0);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(0);

    sampleAnimationTrack(out, track, 1);
    expect(out[0]).toBeCloseTo(10);
    expect(out[1]).toBeCloseTo(20);
    expect(out[2]).toBeCloseTo(-30);

    sampleAnimationTrack(out, track, 0.5);
    expect(out[0]).toBeCloseTo(5);
    expect(out[1]).toBeCloseTo(10);
    expect(out[2]).toBeCloseTo(-15);
  });

  it('uses SceneAnimationTarget as channel targetRef', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Bone', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD_BLOCK_SKELETON, skeletonBody.length);

    const poseBody = buildSkeletonPoseBody('P0', [IDENTITY_TRANSFORM]);
    const poseBlock = buildBlockHeader(2, AWD_BLOCK_SKELETON_POSE, poseBody.length);

    const animBody = buildSkeletonAnimationBody('Anim', [{ duration: 100, poseBlockId: 2 }]);
    const animBlock = buildBlockHeader(3, AWD_BLOCK_SKELETON_ANIMATION, animBody.length);

    const body = concatBytes(skeletonBlock, skeletonBody, poseBlock, poseBody, animBlock, animBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const joints = [createSceneNode()];
    const clip = parseAwdSkeletonAnimation(awd, joints)!;
    const target = clip.channels[0].targetRef as SceneAnimationTarget;
    expect(target.node).toBe(joints[0]);
    expect(target.path).toBe('Translation');
  });

  it('handles poses with missing transforms using identity translation', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Joint0', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD_BLOCK_SKELETON, skeletonBody.length);

    const poseBody = buildSkeletonPoseBody('P0', [null]);
    const poseBlock = buildBlockHeader(2, AWD_BLOCK_SKELETON_POSE, poseBody.length);

    const animBody = buildSkeletonAnimationBody('Anim', [{ duration: 100, poseBlockId: 2 }]);
    const animBlock = buildBlockHeader(3, AWD_BLOCK_SKELETON_ANIMATION, animBody.length);

    const body = concatBytes(skeletonBlock, skeletonBody, poseBlock, poseBody, animBlock, animBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const clip = parseAwdSkeletonAnimation(awd, [createSceneNode()])!;
    const out = [0, 0, 0];
    sampleAnimationTrack(out, clip.channels[0].track, 0);
    expect(out).toEqual([0, 0, 0]);
  });

  it('returns null and warns when the joints array is shorter than the skeleton', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM },
      { name: 'Child', parentIndex: 1, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD_BLOCK_SKELETON, skeletonBody.length);

    const poseBody = buildSkeletonPoseBody('P0', [IDENTITY_TRANSFORM, IDENTITY_TRANSFORM]);
    const poseBlock = buildBlockHeader(2, AWD_BLOCK_SKELETON_POSE, poseBody.length);

    const animBody = buildSkeletonAnimationBody('Anim', [{ duration: 100, poseBlockId: 2 }]);
    const animBlock = buildBlockHeader(3, AWD_BLOCK_SKELETON_ANIMATION, animBody.length);

    const body = concatBytes(skeletonBlock, skeletonBody, poseBlock, poseBody, animBlock, animBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const warnings: string[] = [];
    const clip = parseAwdSkeletonAnimation(awd, [createSceneNode()], warnings);
    expect(clip).toBeNull();
    expect(warnings.some((w) => w.includes('1 nodes but skeleton has 2 joints'))).toBe(true);
  });

  it('returns null and warns when no skeleton blocks are found', () => {
    const awd = buildAwdHeader(0);
    const warnings: string[] = [];
    const clip = parseAwdSkeletonAnimation(awd, [], warnings);
    expect(clip).toBeNull();
    expect(warnings.some((w) => w.includes('no skeleton blocks'))).toBe(true);
  });

  it('returns null and warns when no animation blocks are found', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD_BLOCK_SKELETON, skeletonBody.length);

    const body = concatBytes(skeletonBlock, skeletonBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const warnings: string[] = [];
    const clip = parseAwdSkeletonAnimation(awd, [createSceneNode()], warnings);
    expect(clip).toBeNull();
    expect(warnings.some((w) => w.includes('no skeleton animation blocks'))).toBe(true);
  });

  it('returns null and warns for truncated input', () => {
    const warnings: string[] = [];
    const clip = parseAwdSkeletonAnimation(new Uint8Array(4), [], warnings);
    expect(clip).toBeNull();
    expect(warnings.some((w) => w.includes('header'))).toBe(true);
  });

  it('returns null and warns for invalid magic', () => {
    const bogus = new Uint8Array(12);
    const warnings: string[] = [];
    const clip = parseAwdSkeletonAnimation(bogus, [], warnings);
    expect(clip).toBeNull();
    expect(warnings.some((w) => w.includes('magic'))).toBe(true);
  });

  it('warns when animation references a missing pose block', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD_BLOCK_SKELETON, skeletonBody.length);

    const animBody = buildSkeletonAnimationBody('Anim', [{ duration: 100, poseBlockId: 99 }]);
    const animBlock = buildBlockHeader(2, AWD_BLOCK_SKELETON_ANIMATION, animBody.length);

    const body = concatBytes(skeletonBlock, skeletonBody, animBlock, animBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const warnings: string[] = [];
    const clip = parseAwdSkeletonAnimation(awd, [createSceneNode()], warnings);
    expect(clip).not.toBeNull();
    expect(warnings.some((w) => w.includes('pose block 99'))).toBe(true);
  });

  it('converts pose durations from milliseconds to seconds in keyframe times', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD_BLOCK_SKELETON, skeletonBody.length);

    const pose0Body = buildSkeletonPoseBody('P0', [IDENTITY_TRANSFORM]);
    const pose0Block = buildBlockHeader(2, AWD_BLOCK_SKELETON_POSE, pose0Body.length);

    const pose1Body = buildSkeletonPoseBody('P1', [IDENTITY_TRANSFORM]);
    const pose1Block = buildBlockHeader(3, AWD_BLOCK_SKELETON_POSE, pose1Body.length);

    const animBody = buildSkeletonAnimationBody('Anim', [
      { duration: 250, poseBlockId: 2 },
      { duration: 750, poseBlockId: 3 },
    ]);
    const animBlock = buildBlockHeader(4, AWD_BLOCK_SKELETON_ANIMATION, animBody.length);

    const body = concatBytes(
      skeletonBlock,
      skeletonBody,
      pose0Block,
      pose0Body,
      pose1Block,
      pose1Body,
      animBlock,
      animBody,
    );
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const clip = parseAwdSkeletonAnimation(awd, [createSceneNode()])!;
    expect(clip.duration).toBeCloseTo(1.0);

    const track = clip.channels[0].track;
    expect(track.times[0]).toBeCloseTo(0);
    expect(track.times[1]).toBeCloseTo(0.25);
  });
});
