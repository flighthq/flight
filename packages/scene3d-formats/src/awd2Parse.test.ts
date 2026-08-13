import { sampleAnimationTrack } from '@flighthq/animation/contract';
import {
  registerDecompressor,
  registerDeflateDecompressor,
  unregisterDecompressor,
} from '@flighthq/compression/contract';
import { createVector3, rotateVector3ByQuaternion } from '@flighthq/geometry/contract';
import {
  getMeshGeometryIndexCount,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh/contract';
import { getNodeChildren, getNodeLocalMatrix4, getNodeParent } from '@flighthq/node/contract';
import { createNode3D, isMesh } from '@flighthq/scene3d/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type { Decompressor } from '@flighthq/types/contract';
import { Compression } from '@flighthq/types/contract';
import type {
  AmbientLight,
  AnimationClip,
  DirectionalLight,
  EmbeddedImageResourceReference,
  ExternalImageResourceReference,
  ImportDiagnostic,
  Mesh,
  PointLight,
  Scene3DAnimationTarget,
  Scene3DDocumentLight,
  Node3D,
  ShadedMaterial,
} from '@flighthq/types/contract';
import {
  AmbientLightKind,
  DirectionalLightKind,
  ImportDiagnosticSeverity,
  PointLightKind,
  ResourceResolutionState,
  ShadedMaterialKind,
} from '@flighthq/types/contract';

import { createScene3DFromAwd2, parseAwd2, parseAwd2SkeletonAnimations } from './awd2Parse';
import {
  AWD2_BLOCK_CONTAINER,
  AWD2_BLOCK_CAMERA,
  AWD2_BLOCK_LIGHT,
  AWD2_BLOCK_LIGHT_PICKER,
  AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC,
  AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC_OFFCENTER,
  AWD2_CAMERA_PROJECTION_PERSPECTIVE,
  AWD2_CAMERA_PROP_FOV,
  AWD2_CAMERA_PROP_ORTHO_BOTTOM,
  AWD2_CAMERA_PROP_ORTHO_LEFT,
  AWD2_CAMERA_PROP_ORTHO_RIGHT,
  AWD2_CAMERA_PROP_ORTHO_TOP,
  AWD2_BLOCK_MATERIAL,
  AWD2_BLOCK_MESH_INSTANCE,
  AWD2_BLOCK_SKELETON,
  AWD2_BLOCK_SKELETON_ANIMATION,
  AWD2_BLOCK_SKELETON_POSE,
  AWD2_BLOCK_TEXTURE,
  AWD2_BLOCK_TRIANGLE_GEOMETRY,
  AWD2_COMPRESSION_DEFLATE,
  AWD2_COMPRESSION_LZMA,
  AWD2_DATA_FLOAT32,
  AWD2_DATA_UINT16,
  AWD2_HEADER_BYTES,
  AWD2_LIGHT_PROP_AMBIENT,
  AWD2_LIGHT_PROP_AMBIENT_COLOR,
  AWD2_LIGHT_PROP_COLOR,
  AWD2_LIGHT_PROP_DIFFUSE,
  AWD2_LIGHT_PROP_DIRECTION_X,
  AWD2_LIGHT_PROP_DIRECTION_Y,
  AWD2_LIGHT_PROP_DIRECTION_Z,
  AWD2_LIGHT_PROP_FALLOFF,
  AWD2_LIGHT_PROP_RADIUS,
  AWD2_LIGHT_PROP_SHADOW_MAPPER,
  AWD2_LIGHT_PROP_SPECULAR,
  AWD2_LIGHT_TYPE_DIRECTIONAL,
  AWD2_LIGHT_TYPE_POINT,
  AWD2_MATERIAL_PROP_ALPHA,
  AWD2_MATERIAL_PROP_COLOR,
  AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE,
  AWD2_MATERIAL_PROP_GLOSS,
  AWD2_MATERIAL_PROP_NORMAL_TEXTURE,
  AWD2_MATERIAL_PROP_SPECULAR_COLOR,
  AWD2_MATERIAL_PROP_SPECULAR_STRENGTH,
  AWD2_MATERIAL_PROP_SPECULAR_TEXTURE,
  AWD2_MATERIAL_TYPE_COLOR,
  AWD2_MATERIAL_TYPE_TEXTURE,
  AWD2_NAMESPACE_CORE,
  AWD2_STREAM_INDICES,
  AWD2_STREAM_JOINT_INDICES,
  AWD2_STREAM_JOINT_WEIGHTS,
  AWD2_STREAM_NORMALS,
  AWD2_STREAM_POSITIONS,
  AWD2_STREAM_TANGENTS,
  AWD2_STREAM_UVS,
  AWD2_TEXTURE_TYPE_EMBEDDED,
  AWD2_TEXTURE_TYPE_EXTERNAL,
} from './awd2Schema';
import { getTestTextureResource } from './scene3DFormatsTestHelper';

function buildAwdHeader(bodyLength: number, compression = 0, flags = 0, versionMajor = 2): Uint8Array {
  const header = new Uint8Array(12);
  const view = new DataView(header.buffer);
  header[0] = 0x41; // 'A'
  header[1] = 0x57; // 'W'
  header[2] = 0x44; // 'D'
  header[3] = versionMajor; // version major
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
  namespace = AWD2_NAMESPACE_CORE,
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

// Scene3DHeader layout: parentId(uint32) → matrix4x3(12×float32) → name(VarString)
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

// MeshInstance layout: Scene3DHeader → geometryId(uint32) → numMaterials(uint16) → materialIds → NumAttrList → UserAttrList
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
// Each property here is a uint32 value (key, value) — enough for the diffuse-texture and color keys; a
// float32 property (e.g. alpha) is passed as its uint32 bit pattern via `float32Bits`. `numMethods` sets
// the declared method count (the method bodies themselves are not emitted — the parser does not walk them).
function buildMaterialBody(name: string, matType: number, props: Array<[number, number]>, numMethods = 0): Uint8Array {
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
  return concatBytes(nameBytes, new Uint8Array([matType, numMethods]), propList, buildEmptyAttrList());
}

// The uint32 bit pattern of a float32 value, so a float property can ride buildMaterialBody's uint32 slot.
function float32Bits(value: number): number {
  const buffer = new ArrayBuffer(4);
  const dv = new DataView(buffer);
  dv.setFloat32(0, value, true);
  return dv.getUint32(0, true);
}

// A minimal AWD file (triangle geometry + one material block, id 2, bound by a single mesh instance) for
// exercising resolveAwdMaterial on `matBody` in isolation. Read the result via mesh.materials[0].
function buildSingleMaterialAwd(matBody: Uint8Array): Uint8Array {
  const posStream = buildStream(
    AWD2_STREAM_POSITIONS,
    AWD2_DATA_FLOAT32,
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  );
  const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
  const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
  const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [2]);
  const body = concatBytes(
    buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
    geomBody,
    buildBlockHeader(2, AWD2_BLOCK_MATERIAL, matBody.length),
    matBody,
    buildBlockHeader(3, AWD2_BLOCK_MESH_INSTANCE, miBody.length),
    miBody,
  );
  return concatBytes(buildAwdHeader(body.length), body);
}

// Builds an AWD typed-property list from (key, value-bytes) records: a uint32 total byte length, then
// `uint16 key, uint32 fieldLength, <value>` per record. The value width is PER RECORD, which is how one
// list carries the mixed uint8/uint32/float32/float64 properties a light block uses.
function buildPropertyList(props: ReadonlyArray<readonly [number, Uint8Array]>): Uint8Array {
  let total = 0;
  for (const [, value] of props) total += 6 + value.length;
  const list = new Uint8Array(4 + total);
  const view = new DataView(list.buffer);
  view.setUint32(0, total, true);
  let offset = 4;
  for (const [key, value] of props) {
    view.setUint16(offset, key, true);
    view.setUint32(offset + 2, value.length, true);
    list.set(value, offset + 6);
    offset += 6 + value.length;
  }
  return list;
}

function propUint8(value: number): Uint8Array {
  return new Uint8Array([value]);
}

function propUint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function propFloat32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setFloat32(0, value, true);
  return bytes;
}

function propFloat64(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, true);
  return bytes;
}

// Light layout: parentId(uint32) → matrix(12 × float32) → name(VarString) → lightType(uint8) →
// PropertyList → UserAttrList.
function buildLightBody(
  name: string,
  parentId: number,
  transform: readonly number[],
  lightType: number,
  props: ReadonlyArray<readonly [number, Uint8Array]>,
): Uint8Array {
  const head = new Uint8Array(4 + 12 * 4);
  const view = new DataView(head.buffer);
  view.setUint32(0, parentId, true);
  for (let i = 0; i < 12; i++) view.setFloat32(4 + i * 4, transform[i], true);
  return concatBytes(
    head,
    buildAwdString(name),
    new Uint8Array([lightType]),
    buildPropertyList(props),
    buildEmptyAttrList(),
  );
}

// LightPicker layout: name(VarString) → numLights(uint16) → lightIds(uint32 × N) → UserAttrList. Unlike
// most AWD blocks it carries no property list.
function buildLightPickerBody(name: string, lightIds: readonly number[]): Uint8Array {
  const ids = new Uint8Array(2 + lightIds.length * 4);
  const view = new DataView(ids.buffer);
  view.setUint16(0, lightIds.length, true);
  for (let i = 0; i < lightIds.length; i++) view.setUint32(2 + i * 4, lightIds[i], true);
  return concatBytes(buildAwdString(name), ids, buildEmptyAttrList());
}

// Assembles an AWD file from explicit (id, type, body) blocks, with the header sized to the concatenated
// block stream. Ids are explicit so a light-picker fixture can reference the light blocks by id.
function buildAwdFileOfBlocks(
  blocks: ReadonlyArray<{ body: Uint8Array; flags?: number; id: number; type: number }>,
): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const block of blocks) {
    parts.push(buildBlockHeader(block.id, block.type, block.body.length, block.flags ?? 0), block.body);
  }
  const body = concatBytes(...parts);
  return concatBytes(buildAwdHeader(body.length), body);
}

// A one-light AWD file — the minimal fixture for the light import. No picker: a file that scopes nothing
// drops nothing, so the light crumbs under test are the only diagnostics the file can produce.
function buildSingleLightAwd(
  lightType: number,
  props: ReadonlyArray<readonly [number, Uint8Array]>,
  name = 'Key',
  transform: readonly number[] = IDENTITY_TRANSFORM,
): Uint8Array {
  return buildAwdFileOfBlocks([
    { body: buildLightBody(name, 0, transform, lightType, props), id: 1, type: AWD2_BLOCK_LIGHT },
  ]);
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
  const posStream = buildStream(
    AWD2_STREAM_POSITIONS,
    AWD2_DATA_FLOAT32,
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  );
  const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
  const jointIndexStream = buildStream(
    AWD2_STREAM_JOINT_INDICES,
    AWD2_DATA_FLOAT32,
    new Uint16Array([0, 1, 0, 1, 1, 0]),
  );
  const jointWeightStream = buildStream(
    AWD2_STREAM_JOINT_WEIGHTS,
    AWD2_DATA_FLOAT32,
    new Float32Array([0.75, 0.25, 0.5, 0.5, 1, 0]),
  );
  const geomBody = buildTriangleGeometryBody('Skinned', [
    { streams: [posStream, idxStream, jointIndexStream, jointWeightStream] },
  ]);
  const skelBody = buildSkeletonBody('Rig', [
    { name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    {
      name: 'Child',
      parentIndex: 1,
      transform: [1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 0, 0],
    },
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
    buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
    geomBody,
    buildBlockHeader(2, AWD2_BLOCK_SKELETON, skelBody.length),
    skelBody,
    buildBlockHeader(3, AWD2_BLOCK_MESH_INSTANCE, miBody.length),
    miBody,
    buildBlockHeader(5, AWD2_BLOCK_SKELETON_POSE, pose0Body.length),
    pose0Body,
    buildBlockHeader(6, AWD2_BLOCK_SKELETON_POSE, pose1Body.length),
    pose1Body,
    buildBlockHeader(7, AWD2_BLOCK_SKELETON_ANIMATION, animBody.length),
    animBody,
  );
  return concatBytes(buildAwdHeader(body.length), body);
})();

// The single clip a one-animation AWD fixture yields (undefined for a file with no clip).
const firstAwdClip = (
  bytes: Readonly<Uint8Array>,
  joints: readonly Node3D[],
  diagnostics?: ImportDiagnostic[],
): AnimationClip | undefined => Object.values(parseAwd2SkeletonAnimations(bytes, joints, diagnostics))[0];

// Asserts EXACTLY ONE crumb of `kind` was recorded (guards the count) and returns it so a test can lock
// the full contract — severity, true origin, and detail — for that emitted diagnostic.
function expectOneCrumb(diagnostics: readonly ImportDiagnostic[], kind: string): ImportDiagnostic {
  const matches = diagnostics.filter((d) => d.kind === kind);
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe('awd2 diagnostic crumb coverage', () => {
  it.each(CREATE_PATH_TRUNCATIONS)(
    'records $kind (field $field) on the createScene3DFromAwd2 path',
    ({ blockType, body, bytes, cut, field, kind, lights, origin }) => {
      const diagnostics: ImportDiagnostic[] = [];
      createScene3DFromAwd2(truncatedAwd(blockType, body, cut), diagnostics);
      expect(diagnostics).toHaveLength(1);
      const crumb = expectOneCrumb(diagnostics, kind);
      expect(crumb.severity).toBe('Drop');
      expect(crumb.origin).toBe(origin);
      expect(crumb.detail?.field).toBe(field);
      expect(crumb.detail?.bytes).toBe(bytes); // undefined for every field variant except texture 'data'
      expect(crumb.detail?.lights).toBe(lights); // undefined for every field variant except picker 'lightIds'
    },
  );

  // The pose/animation truncation crumbs on the createScene3DFromAwd2 DOCUMENT path — the path the sink
  // repair fixed. A valid skeleton drives buildAwdDocumentAnimations (and suppresses no-skeleton-blocks),
  // so the truncated block's crumb is the ONLY diagnostic: assert the full set is exactly one, not merely
  // that this kind appears among others.
  it.each(ANIM_PATH_TRUNCATIONS)(
    'records $kind (field $field) on the repaired createScene3DFromAwd2 document path',
    ({ blockType, body, cut, field, kind, origin }) => {
      const diagnostics: ImportDiagnostic[] = [];
      createScene3DFromAwd2(docPathTruncatedAwd(blockType, body, cut), diagnostics);
      expect(diagnostics).toHaveLength(1);
      const crumb = expectOneCrumb(diagnostics, kind);
      expect(crumb.severity).toBe('Drop');
      expect(crumb.origin).toBe(origin);
      expect(crumb.detail?.field).toBe(field);
      expect(crumb.detail?.bytes).toBeUndefined();
    },
  );

  it('records multiple-skeletons (Drop, parseAwd2) when a file carries more than one skeleton', () => {
    const skel = buildSkeletonBody('Rig', [{ name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM }]);
    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_SKELETON, skel.length),
      skel,
      buildBlockHeader(2, AWD2_BLOCK_SKELETON, skel.length),
      skel,
    );
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.multiple-skeletons');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseAwd2');
    expect(crumb.detail?.skeletons).toBe(2);
  });

  it('records submesh-no-positions (Drop, parseTriangleGeometryBlock) when a sub-mesh has no position stream', () => {
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [idxStream] }]);
    const body = concatBytes(buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length), geomBody);
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.submesh-no-positions');
    expect(crumb.detail).toBeUndefined();
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseTriangleGeometryBlock');
  });

  it('records geometry-truncated (field name) when the block ends before the geometry name', () => {
    const geomBody = new Uint8Array(1); // less than the 2 bytes a VarString length needs
    const body = concatBytes(buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length), geomBody);
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.geometry-truncated');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseTriangleGeometryBlock');
    expect(crumb.detail?.field).toBe('name');
  });

  it('records geometry-truncated (field name) when the declared name PAYLOAD runs past the block', () => {
    // Length prefix says 10 name bytes, but only one payload byte is present — the missing bytes belong to
    // the name, so the field must be 'name', not 'num-submeshes'.
    const geomBody = new Uint8Array([10, 0, 65]);
    const body = concatBytes(buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length), geomBody);
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.geometry-truncated');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseTriangleGeometryBlock');
    expect(crumb.detail?.field).toBe('name');
  });

  it('records geometry-truncated (field num-submeshes) when the block ends before the sub-mesh count', () => {
    const geomBody = buildAwdString('Geo'); // name only, nothing after
    const body = concatBytes(buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length), geomBody);
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.geometry-truncated');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseTriangleGeometryBlock');
    expect(crumb.detail?.field).toBe('num-submeshes');
  });

  it('records submesh-truncated when a declared sub-mesh header is missing', () => {
    const numSubMeshes = new Uint8Array(2);
    new DataView(numSubMeshes.buffer).setUint16(0, 1, true); // declares one sub-mesh, supplies none
    const geomBody = concatBytes(buildAwdString('Geo'), numSubMeshes, new Uint8Array(4));
    const body = concatBytes(buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length), geomBody);
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.submesh-truncated');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseTriangleGeometryBlock');
    expect(crumb.detail?.firstSubMesh).toBe(0);
  });

  it('records stream-data-past-end (Recover, parseTriangleGeometryBlock) when a stream declares more bytes than the block holds', () => {
    const posStream = buildStream(
      AWD2_STREAM_POSITIONS,
      AWD2_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    // A stream header that declares 9999 payload bytes but carries only 4 — overshoots the block end.
    const badStream = new Uint8Array(6 + 4);
    badStream[0] = AWD2_STREAM_UVS;
    badStream[1] = AWD2_DATA_FLOAT32;
    new DataView(badStream.buffer).setUint32(2, 9999, true);
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, badStream] }]);
    const body = concatBytes(buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length), geomBody);
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.stream-data-past-end');
    expect(crumb.detail).toBeUndefined();
    expect(crumb.severity).toBe('Recover');
    expect(crumb.origin).toBe('parseTriangleGeometryBlock');
  });

  it('records skin-streams-mismatch (Recover, parseTriangleGeometryBlock) when joint streams do not match the vertex count', () => {
    const posStream = buildStream(
      AWD2_STREAM_POSITIONS,
      AWD2_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    // 3 vertices, weights imply 2 influences/vertex, but only 2 joint indices are present (need 6).
    const jointIndexStream = buildStream(AWD2_STREAM_JOINT_INDICES, AWD2_DATA_FLOAT32, new Uint16Array([0, 1]));
    const jointWeightStream = buildStream(
      AWD2_STREAM_JOINT_WEIGHTS,
      AWD2_DATA_FLOAT32,
      new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    );
    const geomBody = buildTriangleGeometryBody('Skin', [
      { streams: [posStream, idxStream, jointIndexStream, jointWeightStream] },
    ]);
    const body = concatBytes(buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length), geomBody);
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.skin-streams-mismatch');
    expect(crumb.detail).toBeUndefined();
    expect(crumb.severity).toBe('Recover');
    expect(crumb.origin).toBe('parseTriangleGeometryBlock');
  });

  it('records material-missing (Drop, resolveAwdMaterial) when a mesh references an absent material block', () => {
    const posStream = buildStream(
      AWD2_STREAM_POSITIONS,
      AWD2_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
    const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [99]);
    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(3, AWD2_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.material-missing');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('resolveAwdMaterial');
    expect(crumb.detail?.material).toBe(99);
  });

  it('records texture-missing (Drop, resolveAwdTexture) when a material references an absent texture block', () => {
    const posStream = buildStream(
      AWD2_STREAM_POSITIONS,
      AWD2_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
    const matBody = buildMaterialBody('Mat', AWD2_MATERIAL_TYPE_TEXTURE, [[AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE, 99]]);
    const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [2]);
    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD2_BLOCK_MATERIAL, matBody.length),
      matBody,
      buildBlockHeader(3, AWD2_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.texture-missing');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('resolveAwdTexture');
    expect(crumb.detail?.texture).toBe(99);
  });

  it('records texture-unrecognized-format (Recover, parseTextureBlock) for an embedded payload that is not an image', () => {
    const posStream = buildStream(
      AWD2_STREAM_POSITIONS,
      AWD2_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
    const texBody = buildTextureBody('bad.dat', AWD2_TEXTURE_TYPE_EMBEDDED, new Uint8Array([1, 2, 3, 4]));
    const matBody = buildMaterialBody('Mat', AWD2_MATERIAL_TYPE_TEXTURE, [[AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE, 2]]);
    const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [3]);
    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD2_BLOCK_TEXTURE, texBody.length),
      texBody,
      buildBlockHeader(3, AWD2_BLOCK_MATERIAL, matBody.length),
      matBody,
      buildBlockHeader(4, AWD2_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.texture-unrecognized-format');
    expect(crumb.detail).toBeUndefined();
    expect(crumb.severity).toBe('Recover');
    expect(crumb.origin).toBe('parseTextureBlock');
  });

  it('records animation-no-poses (Drop, buildAwdSkeletonAnimationClip) on the live clip path', () => {
    const skel = buildSkeletonBody('Rig', [{ name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM }]);
    const anim = buildSkeletonAnimationBody('Anim', []);
    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_SKELETON, skel.length),
      skel,
      buildBlockHeader(2, AWD2_BLOCK_SKELETON_ANIMATION, anim.length),
      anim,
    );
    const diagnostics: ImportDiagnostic[] = [];
    parseAwd2SkeletonAnimations(concatBytes(buildAwdHeader(body.length), body), [createNode3D()], diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.animation-no-poses');
    expect(crumb.detail).toBeUndefined();
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('buildAwdSkeletonAnimationClip');
  });

  it('records animation-no-poses (Drop, buildAwdDocumentAnimation) on the document path', () => {
    const skel = buildSkeletonBody('Rig', [{ name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM }]);
    const anim = buildSkeletonAnimationBody('Anim', []);
    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_SKELETON, skel.length),
      skel,
      buildBlockHeader(2, AWD2_BLOCK_SKELETON_ANIMATION, anim.length),
      anim,
    );
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.animation-no-poses');
    expect(crumb.detail).toBeUndefined();
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('buildAwdDocumentAnimation');
  });

  it('records pose-block-missing (Recover, buildAwdDocumentAnimation) on the document path', () => {
    const skel = buildSkeletonBody('Rig', [{ name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM }]);
    const anim = buildSkeletonAnimationBody('Anim', [{ duration: 100, poseBlockId: 99 }]);
    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_SKELETON, skel.length),
      skel,
      buildBlockHeader(2, AWD2_BLOCK_SKELETON_ANIMATION, anim.length),
      anim,
    );
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.pose-block-missing');
    expect(crumb.severity).toBe('Recover');
    expect(crumb.origin).toBe('buildAwdDocumentAnimation');
    expect(crumb.detail?.distinctPoseBlocks).toBe(1);
    expect(crumb.detail?.firstPoseBlock).toBe(99);
  });

  it('records block-length-past-end (Recover, parseAwd2SkeletonAnimations) when a block overruns the body', () => {
    const blockHeader = buildBlockHeader(1, AWD2_BLOCK_SKELETON, 9999);
    const diagnostics: ImportDiagnostic[] = [];
    parseAwd2SkeletonAnimations(concatBytes(buildAwdHeader(blockHeader.length), blockHeader), [], diagnostics);
    // The overrun aborts the walk with no skeleton parsed, so the full emitted set is exactly these two,
    // in walk order: the block-length abort, then the empty-result no-skeleton-blocks reject. Lock both.
    expect(diagnostics.map((d) => d.kind)).toEqual(['awd2.block-length-past-end', 'awd2.no-skeleton-blocks']);
    const crumb = expectOneCrumb(diagnostics, 'awd2.block-length-past-end');
    expect(crumb.detail).toBeUndefined();
    expect(crumb.severity).toBe('Recover');
    expect(crumb.origin).toBe('parseAwd2SkeletonAnimations');
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

describe('createScene3DFromAwd2', () => {
  it('parses a single triangle with positions and indices', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint16Array([0, 1, 2]);

    const posStream = buildStream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, positions);
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, indices);
    const geomBody = buildTriangleGeometryBody('Triangle', [{ streams: [posStream, idxStream] }]);
    const geomBlockHeader = buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length);

    const meshBody = buildMeshInstanceBody('TriMesh', 0, IDENTITY_TRANSFORM, 1);
    const meshBlockHeader = buildBlockHeader(2, AWD2_BLOCK_MESH_INSTANCE, meshBody.length);

    const body = concatBytes(geomBlockHeader, geomBody, meshBlockHeader, meshBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const scene = createScene3DFromAwd2(awd);
    const children = getNodeChildren(scene.root);
    expect(children).toHaveLength(1);
    expect(isMesh(children[0] as Node3D)).toBe(true);
    expect((children[0] as Node3D).name).toBe('TriMesh');

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

  // AWD ships left-handed, so the importer negates position Z — a det = -1 reflection that flips every
  // triangle's winding. Indexed sub-meshes had that compensated; non-indexed ones did not, so they came
  // out inside out and were culled away. The winding correction has to follow the reflection whether or
  // not the source shipped indices.
  it('reverses the winding of a non-indexed sub-mesh', () => {
    // A counter-clockwise triangle in AWD's space. After the Z flip alone it would read clockwise.
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const posStream = buildStream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, positions);
    const geomBody = buildTriangleGeometryBody('NoIndices', [{ streams: [posStream] }]);
    const geomBlockHeader = buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length);
    const meshBody = buildMeshInstanceBody('NoIndicesMesh', 0, IDENTITY_TRANSFORM, 1);
    const meshBlockHeader = buildBlockHeader(2, AWD2_BLOCK_MESH_INSTANCE, meshBody.length);
    const body = concatBytes(geomBlockHeader, geomBody, meshBlockHeader, meshBody);

    const scene = createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body));
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    expect(getMeshGeometryIndexCount(geometry)).toBe(0);
    // Vertices 1 and 2 are swapped relative to the source order — the non-indexed winding reversal.
    const p = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 1);
    expect([p.x, p.y, p.z]).toEqual([0, 1, 0]);
    getMeshGeometryVertexPosition(p, geometry, 2);
    expect([p.x, p.y, p.z]).toEqual([1, 0, 0]);
  });

  // Normal generation was gated on indices existing, so a non-indexed sub-mesh with no NORMAL stream
  // kept the zero-filled normals the vertex buffer starts at. Every lit material normalizes that zero
  // vector, which is undefined — black or garbage shading rather than a flat-shaded surface.
  it('generates normals for a non-indexed sub-mesh that carries none', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const posStream = buildStream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, positions);
    const geomBody = buildTriangleGeometryBody('NoNormals', [{ streams: [posStream] }]);
    const geomBlockHeader = buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length);
    const meshBody = buildMeshInstanceBody('NoNormalsMesh', 0, IDENTITY_TRANSFORM, 1);
    const meshBlockHeader = buildBlockHeader(2, AWD2_BLOCK_MESH_INSTANCE, meshBody.length);
    const body = concatBytes(geomBlockHeader, geomBody, meshBlockHeader, meshBody);

    const scene = createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body));
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    const floatsPerVertex = geometry.layout.stride / 4;
    for (let v = 0; v < getMeshGeometryVertexCount(geometry); v++) {
      const base = v * floatsPerVertex + 3;
      const length = Math.hypot(geometry.vertices[base], geometry.vertices[base + 1], geometry.vertices[base + 2]);
      expect(length).toBeCloseTo(1, 5);
    }
  });

  // Same gate on the tangent basis. A normal-mapped material reconstructs the bitangent as B = w·N×T,
  // so a zero tangent collapses the whole TBN frame.
  it('generates a tangent basis for a non-indexed sub-mesh with UVs and no tangent stream', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const uvs = new Float32Array([0, 0, 1, 0, 0, 1]);
    const posStream = buildStream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, positions);
    const uvStream = buildStream(AWD2_STREAM_UVS, AWD2_DATA_FLOAT32, uvs);
    const geomBody = buildTriangleGeometryBody('NoTangents', [{ streams: [posStream, uvStream] }]);
    const geomBlockHeader = buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length);
    const meshBody = buildMeshInstanceBody('NoTangentsMesh', 0, IDENTITY_TRANSFORM, 1);
    const meshBlockHeader = buildBlockHeader(2, AWD2_BLOCK_MESH_INSTANCE, meshBody.length);
    const body = concatBytes(geomBlockHeader, geomBody, meshBlockHeader, meshBody);

    const scene = createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body));
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    const floatsPerVertex = geometry.layout.stride / 4;
    for (let v = 0; v < getMeshGeometryVertexCount(geometry); v++) {
      const base = v * floatsPerVertex + 6;
      const length = Math.hypot(geometry.vertices[base], geometry.vertices[base + 1], geometry.vertices[base + 2]);
      expect(length).toBeCloseTo(1, 5);
      // The handedness w must be a real sign, not the zero a collapsed basis leaves.
      expect(Math.abs(geometry.vertices[base + 3])).toBe(1);
    }
  });

  it('parses geometry with UVs and normals', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const uvs = new Float32Array([0, 0, 1, 0, 0.5, 1]);
    const indices = new Uint16Array([0, 1, 2]);

    const posStream = buildStream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, positions);
    const normStream = buildStream(AWD2_STREAM_NORMALS, AWD2_DATA_FLOAT32, normals);
    const uvStream = buildStream(AWD2_STREAM_UVS, AWD2_DATA_FLOAT32, uvs);
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, indices);
    const geomBody = buildTriangleGeometryBody('Geom', [{ streams: [posStream, normStream, uvStream, idxStream] }]);
    const geomBlockHeader = buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length);

    const meshBody = buildMeshInstanceBody('Mesh', 0, IDENTITY_TRANSFORM, 1);
    const meshBlockHeader = buildBlockHeader(2, AWD2_BLOCK_MESH_INSTANCE, meshBody.length);

    const body = concatBytes(geomBlockHeader, geomBody, meshBlockHeader, meshBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const scene = createScene3DFromAwd2(awd);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    const n = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexNormal(n, geometry, 0);
    expect([n.x, n.y, n.z]).toEqual([0, 0, -1]);

    const uv = { x: 0, y: 0 };
    getMeshGeometryVertexUv0(uv, geometry, 1);
    expect([uv.x, uv.y]).toEqual([1, 0]);
    getMeshGeometryVertexUv0(uv, geometry, 2);
    expect([uv.x, uv.y]).toEqual([0.5, 1]);
  });

  it('writes the tangent xyz and a unit bitangent handedness into tangent.W', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    // Tangents with a Z component so the left→right-handed Z-negation is observable in xyz.
    const tangents = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const indices = new Uint16Array([0, 1, 2]);

    const posStream = buildStream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, positions);
    const normStream = buildStream(AWD2_STREAM_NORMALS, AWD2_DATA_FLOAT32, normals);
    const tanStream = buildStream(AWD2_STREAM_TANGENTS, AWD2_DATA_FLOAT32, tangents);
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, indices);
    const geomBody = buildTriangleGeometryBody('Geom', [{ streams: [posStream, normStream, tanStream, idxStream] }]);
    const geomBlockHeader = buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length);
    const meshBody = buildMeshInstanceBody('Mesh', 0, IDENTITY_TRANSFORM, 1);
    const meshBlockHeader = buildBlockHeader(2, AWD2_BLOCK_MESH_INSTANCE, meshBody.length);
    const body = concatBytes(geomBlockHeader, geomBody, meshBlockHeader, meshBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const geometry = (getNodeChildren(createScene3DFromAwd2(awd).root)[0] as Mesh).geometry;
    const floatsPerVertex = geometry.layout.stride / 4; // 12 for the canonical (non-skinned) layout

    // Tangent xyz (float offset 6-8) carries the AWD tangent with Z negated by the handedness conversion.
    expect([geometry.vertices[6], geometry.vertices[7], geometry.vertices[8]]).toEqual([0, 0, -1]);
    // Tangent W (float offset 9) is the bitangent handedness — the bug was it staying 0; it is now unit.
    expect(Math.abs(geometry.vertices[9])).toBe(1);
    // Every vertex receives the same mesh-wide handedness sign.
    for (let v = 0; v < 3; v++) expect(geometry.vertices[v * floatsPerVertex + 9]).toBe(geometry.vertices[9]);
  });

  it('synthesizes a tangent basis when the sub-mesh has UVs but no tangent stream', () => {
    // Away3D commonly omits the tangent stream; without synthesis the mesh imports with a zero tangent
    // frame and a normal-mapped material renders black. A triangle in the z=0 plane with a varying UV
    // gradient must yield a real, non-degenerate tangent + a unit handedness W.
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const uvs = new Float32Array([0, 0, 1, 0, 0, 1]);
    const indices = new Uint16Array([0, 1, 2]);

    const posStream = buildStream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, positions);
    const normStream = buildStream(AWD2_STREAM_NORMALS, AWD2_DATA_FLOAT32, normals);
    const uvStream = buildStream(AWD2_STREAM_UVS, AWD2_DATA_FLOAT32, uvs);
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, indices);
    // No AWD2_STREAM_TANGENTS — the case Away3D exports hit.
    const geomBody = buildTriangleGeometryBody('Geom', [{ streams: [posStream, normStream, uvStream, idxStream] }]);
    const geomBlockHeader = buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length);
    const meshBody = buildMeshInstanceBody('Mesh', 0, IDENTITY_TRANSFORM, 1);
    const meshBlockHeader = buildBlockHeader(2, AWD2_BLOCK_MESH_INSTANCE, meshBody.length);
    const body = concatBytes(geomBlockHeader, geomBody, meshBlockHeader, meshBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const geometry = (getNodeChildren(createScene3DFromAwd2(awd).root)[0] as Mesh).geometry;
    // Tangent xyz (float offset 6-8) is a real unit-length vector, not the zero a missing stream leaves.
    const [tx, ty, tz] = [geometry.vertices[6], geometry.vertices[7], geometry.vertices[8]];
    expect(Math.hypot(tx, ty, tz)).toBeCloseTo(1, 3);
    // The left-to-right-handed coordinate reflection makes Away3D's generated bitangent sign negative.
    expect(geometry.vertices[9]).toBe(-1);
  });

  it('builds container and mesh instance hierarchy', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint16Array([0, 1, 2]);
    const posStream = buildStream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, positions);
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, indices);
    const geomBody = buildTriangleGeometryBody('Geom', [{ streams: [posStream, idxStream] }]);
    const geomBlockHeader = buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length);

    const containerBody = buildContainerBody('Group', 0, IDENTITY_TRANSFORM);
    const containerBlockHeader = buildBlockHeader(2, AWD2_BLOCK_CONTAINER, containerBody.length);

    const meshBody = buildMeshInstanceBody('ChildMesh', 2, IDENTITY_TRANSFORM, 1);
    const meshBlockHeader = buildBlockHeader(3, AWD2_BLOCK_MESH_INSTANCE, meshBody.length);

    const body = concatBytes(geomBlockHeader, geomBody, containerBlockHeader, containerBody, meshBlockHeader, meshBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const scene = createScene3DFromAwd2(awd);
    const roots = getNodeChildren(scene.root);
    expect(roots).toHaveLength(1);
    const container = roots[0] as Node3D;
    expect(isMesh(container)).toBe(false);

    const containerChildren = getNodeChildren(container);
    expect(containerChildren).toHaveLength(1);
    expect(isMesh(containerChildren[0] as Node3D)).toBe(true);
  });

  it('records a diagnostic and returns empty scene for compressed AWD', () => {
    const awd = buildAwdHeader(0, AWD2_COMPRESSION_DEFLATE);
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromAwd2(awd, diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.compression-no-decompressor');
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('rehydrateAwdBody');
    expect(crumb.detail?.compression).toBe(AWD2_COMPRESSION_DEFLATE);
  });

  it('returns an empty scene and records a diagnostic for truncated input', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromAwd2(new Uint8Array(4), diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.header-too-short');
    expect(crumb.detail).toBeUndefined();
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('parseAwd2');
  });

  it('returns an empty scene and records a diagnostic when magic is invalid', () => {
    const bogus = new Uint8Array(12);
    bogus[0] = 0x00;
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromAwd2(bogus, diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.bad-magic');
    expect(crumb.detail).toBeUndefined();
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('parseAwd2');
  });

  it('rejects a version-3 (AWD3) file by version rather than misparsing it', () => {
    // A version-3 file shares the 'AWD' magic but has a different block model; the AWD2 walk would
    // silently produce an empty/garbage scene, so it must be rejected by version with an AWD3-naming diagnostic.
    const awd3 = buildAwdHeader(0, 0, 0, 3);
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromAwd2(awd3, diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.unsupported-version');
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('isAwd2Version');
    expect(crumb.detail?.version).toBe(3);
  });

  it('returns an empty scene for a valid header with no blocks', () => {
    const awd = buildAwdHeader(0);
    const scene = createScene3DFromAwd2(awd);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
  });

  it('applies transform from mesh instance block', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint16Array([0, 1, 2]);
    const posStream = buildStream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, positions);
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, indices);
    const geomBody = buildTriangleGeometryBody('Geom', [{ streams: [posStream, idxStream] }]);
    const geomBlockHeader = buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length);

    const transform = [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 20, 30];
    const meshBody = buildMeshInstanceBody('Mesh', 0, transform, 1);
    const meshBlockHeader = buildBlockHeader(2, AWD2_BLOCK_MESH_INSTANCE, meshBody.length);

    const body = concatBytes(geomBlockHeader, geomBody, meshBlockHeader, meshBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const scene = createScene3DFromAwd2(awd);
    const meshNode = getNodeChildren(scene.root)[0] as Node3D;
    const m = getNodeLocalMatrix4(meshNode).m;
    expect(m[12]).toBeCloseTo(10);
    expect(m[13]).toBeCloseTo(20);
    expect(m[14]).toBeCloseTo(-30);
    expect(m[0]).toBeCloseTo(1);
    expect(m[5]).toBeCloseTo(1);
    expect(m[10]).toBeCloseTo(1);
  });

  it('records a diagnostic when block length runs past the end of the body', () => {
    const blockHeader = buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, 9999);
    const body = blockHeader;
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromAwd2(awd, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.block-length-past-end');
    expect(crumb.detail).toBeUndefined();
    expect(crumb.severity).toBe('Recover');
    expect(crumb.origin).toBe('parseAwd2');
  });

  it('records a diagnostic when mesh instance references a nonexistent geometry block', () => {
    const meshBody = buildMeshInstanceBody('Mesh', 0, IDENTITY_TRANSFORM, 99);
    const meshBlockHeader = buildBlockHeader(1, AWD2_BLOCK_MESH_INSTANCE, meshBody.length);

    const body = concatBytes(meshBlockHeader, meshBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromAwd2(awd, diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(1);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.mesh-instance-missing-geometry');
    expect(crumb.severity).toBe('Recover');
    expect(crumb.origin).toBe('parseAwd2');
    expect(crumb.detail?.block).toBe(1);
    expect(crumb.detail?.geometry).toBe(99);
  });

  it('parses positions-only geometry without indices', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const posStream = buildStream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, positions);
    const geomBody = buildTriangleGeometryBody('NoIdx', [{ streams: [posStream] }]);
    const geomBlockHeader = buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length);

    const meshBody = buildMeshInstanceBody('Mesh', 0, IDENTITY_TRANSFORM, 1);
    const meshBlockHeader = buildBlockHeader(2, AWD2_BLOCK_MESH_INSTANCE, meshBody.length);

    const body = concatBytes(geomBlockHeader, geomBody, meshBlockHeader, meshBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const scene = createScene3DFromAwd2(awd);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    expect(getMeshGeometryIndexCount(geometry)).toBe(0);

    // The whole vertex record, because a count alone cannot tell a drawable mesh from a degenerate
    // one: this test asserted only the count and stayed green while this exact input imported inside
    // out with zero normals. Positions carry through the Z negation (z is 0 here, so unchanged),
    // normals are generated, and the tangent frame is legitimately left zero — there are no UVs, and
    // fabricating a basis without them would be inventing data rather than deriving it.
    const floatsPerVertex = geometry.layout.stride / 4;
    for (let v = 0; v < 3; v++) {
      const base = v * floatsPerVertex;
      expect(Number.isFinite(geometry.vertices[base])).toBe(true);
      expect(Number.isFinite(geometry.vertices[base + 1])).toBe(true);
      expect(Number.isFinite(geometry.vertices[base + 2])).toBe(true);
      expect(
        Math.hypot(geometry.vertices[base + 3], geometry.vertices[base + 4], geometry.vertices[base + 5]),
      ).toBeCloseTo(1, 5);
      expect(geometry.vertices[base + 6]).toBe(0);
      expect(geometry.vertices[base + 7]).toBe(0);
      expect(geometry.vertices[base + 8]).toBe(0);
    }
  });

  it('attaches a textured ShadedMaterial from a material + embedded texture block', () => {
    const posStream = buildStream(
      AWD2_STREAM_POSITIONS,
      AWD2_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
    const texBody = buildTextureBody('diffuse.png', AWD2_TEXTURE_TYPE_EMBEDDED, FAKE_PNG_BYTES);
    const matBody = buildMaterialBody('Mat', AWD2_MATERIAL_TYPE_TEXTURE, [[AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE, 2]]);
    const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [3]);

    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD2_BLOCK_TEXTURE, texBody.length),
      texBody,
      buildBlockHeader(3, AWD2_BLOCK_MATERIAL, matBody.length),
      matBody,
      buildBlockHeader(4, AWD2_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);

    const mesh = getNodeChildren(scene.root)[0] as Mesh;
    expect(isMesh(mesh)).toBe(true);
    expect(mesh.materials).toHaveLength(1);
    const material = mesh.materials[0] as ShadedMaterial | null;
    expect(material).not.toBeNull();
    expect(material!.kind).toBe(ShadedMaterialKind);
    expect(material!.modifiers).toHaveLength(0); // method-less AWD material → empty modifier stack
    expect(material!.name).toBe('Mat'); // AWD material block name preserved as the authored identity
    expect(material!.diffuseMap).not.toBeNull();
    // The parser references, it does not decode: image stays null, a ref carries the source.
    expect(getTextureSource(material!.diffuseMap!)).toBeNull();
    const ref = getTestTextureResource(scene.resources, material!.diffuseMap!) as EmbeddedImageResourceReference;
    expect(ref.kind).toBe('Embedded');
    expect(ref.mimeType).toBe('image/png');
    expect(ref.bytes).toEqual(FAKE_PNG_BYTES);
    expect(ref.state).toBe(ResourceResolutionState.Unresolved);
    expect(diagnostics).toHaveLength(0);
  });

  it('maps the AWD normal-texture property (3) to the material normalMap', () => {
    const posStream = buildStream(
      AWD2_STREAM_POSITIONS,
      AWD2_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
    const texBody = buildTextureBody('normal.png', AWD2_TEXTURE_TYPE_EMBEDDED, FAKE_PNG_BYTES);
    // A material with a flat color plus a normal texture (block id 2, property 3).
    const matBody = buildMaterialBody('Mat', AWD2_MATERIAL_TYPE_TEXTURE, [
      [AWD2_MATERIAL_PROP_COLOR, 0x808080],
      [AWD2_MATERIAL_PROP_NORMAL_TEXTURE, 2],
    ]);
    const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [3]);

    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD2_BLOCK_TEXTURE, texBody.length),
      texBody,
      buildBlockHeader(3, AWD2_BLOCK_MATERIAL, matBody.length),
      matBody,
      buildBlockHeader(4, AWD2_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const scene = createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body));

    const material = (getNodeChildren(scene.root)[0] as Mesh).materials[0] as ShadedMaterial;
    expect(material.normalMap).not.toBeNull();
    expect(material.normalMap!.colorSpace).toBe('linear');
    expect(getTextureSource(material.normalMap!)).toBeNull(); // referenced, not decoded
    const ref = getTestTextureResource(scene.resources, material.normalMap!) as EmbeddedImageResourceReference;
    expect(ref.kind).toBe('Embedded');
    expect(ref.mimeType).toBe('image/png');
  });

  it('maps the AWD specular-texture property (21) to the material specularMap', () => {
    // Away3D samples the specular map as a plain color multiplier on the specular term, exactly as it
    // samples the diffuse map — so it keeps the default 'srgb', unlike the linear normal map above.
    const posStream = buildStream(
      AWD2_STREAM_POSITIONS,
      AWD2_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
    const texBody = buildTextureBody('spec.png', AWD2_TEXTURE_TYPE_EMBEDDED, FAKE_PNG_BYTES);
    const matBody = buildMaterialBody('Mat', AWD2_MATERIAL_TYPE_TEXTURE, [[AWD2_MATERIAL_PROP_SPECULAR_TEXTURE, 2]]);
    const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [3]);

    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD2_BLOCK_TEXTURE, texBody.length),
      texBody,
      buildBlockHeader(3, AWD2_BLOCK_MATERIAL, matBody.length),
      matBody,
      buildBlockHeader(4, AWD2_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const scene = createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body));

    const material = (getNodeChildren(scene.root)[0] as Mesh).materials[0] as ShadedMaterial;
    expect(material.specularMap).not.toBeNull();
    expect(material.specularMap!.colorSpace).toBe('srgb');
    expect(getTextureSource(material.specularMap!)).toBeNull(); // referenced, not decoded
    const ref = getTestTextureResource(scene.resources, material.specularMap!) as EmbeddedImageResourceReference;
    expect(ref.kind).toBe('Embedded');
    expect(ref.mimeType).toBe('image/png');
  });

  it("defaults an absent specular tuple to AwayJS's gloss 50 and opaque-white specular, not createShadedMaterial's 32", () => {
    // An absent AWD key means AwayJS's SpecularBasicMethod default, not an absent specular term. Importing
    // at createShadedMaterial's own default exponent of 32 would visibly widen every authored highlight.
    const material = (
      getNodeChildren(
        createScene3DFromAwd2(buildSingleMaterialAwd(buildMaterialBody('Bare', AWD2_MATERIAL_TYPE_COLOR, []))).root,
      )[0] as Mesh
    ).materials[0] as ShadedMaterial;
    expect(material.shininess).toBe(50);
    expect(material.specular).toBe(0xffffffff);
    expect(material.specularMap).toBeNull();
  });

  it('maps the AWD gloss (19) and specular-color (20) properties onto shininess and packed specular', () => {
    const matBody = buildMaterialBody('Shiny', AWD2_MATERIAL_TYPE_COLOR, [
      [AWD2_MATERIAL_PROP_GLOSS, float32Bits(12.5)],
      [AWD2_MATERIAL_PROP_SPECULAR_COLOR, 0x336699],
    ]);
    const material = (getNodeChildren(createScene3DFromAwd2(buildSingleMaterialAwd(matBody)).root)[0] as Mesh)
      .materials[0] as ShadedMaterial;
    expect(material.shininess).toBe(12.5);
    expect(material.specular).toBe(0x336699ff);
  });

  it('folds the AWD specular-strength (18) scalar into the packed specular channels', () => {
    // ShadedMaterial has no separate strength scalar, and both backends use `specular.rgb` as a pure
    // multiplier on the specular term — so colour x strength is the same product, not an approximation.
    // 0x80 = 128; 128 * 0.5 = 64 = 0x40.
    const matBody = buildMaterialBody('Half', AWD2_MATERIAL_TYPE_COLOR, [
      [AWD2_MATERIAL_PROP_SPECULAR_COLOR, 0x808080],
      [AWD2_MATERIAL_PROP_SPECULAR_STRENGTH, float32Bits(0.5)],
    ]);
    const diagnostics: ImportDiagnostic[] = [];
    const material = (
      getNodeChildren(createScene3DFromAwd2(buildSingleMaterialAwd(matBody), diagnostics).root)[0] as Mesh
    ).materials[0] as ShadedMaterial;
    expect(material.specular).toBe(0x404040ff);
    expect(diagnostics).toHaveLength(0);
  });

  it('clamps a specular strength above 1 and records awd2.material-specular-strength-clamped', () => {
    // Packed RGBA is 8-bit unsigned, so a strength that would brighten past white cannot survive the fold.
    const matBody = buildMaterialBody('Overdriven', AWD2_MATERIAL_TYPE_COLOR, [
      [AWD2_MATERIAL_PROP_SPECULAR_COLOR, 0x808080],
      [AWD2_MATERIAL_PROP_SPECULAR_STRENGTH, float32Bits(2)],
    ]);
    const diagnostics: ImportDiagnostic[] = [];
    const material = (
      getNodeChildren(createScene3DFromAwd2(buildSingleMaterialAwd(matBody), diagnostics).root)[0] as Mesh
    ).materials[0] as ShadedMaterial;
    expect(material.specular).toBe(0x808080ff);
    const crumb = expectOneCrumb(diagnostics, 'awd2.material-specular-strength-clamped');
    expect(crumb.severity).toBe('Skip');
    expect(crumb.origin).toBe('resolveAwdMaterial');
    expect(crumb.detail?.strength).toBe(2);
  });

  it('attaches a ShadedMaterial from a flat-color material block, widening color to opaque rgba', () => {
    const posStream = buildStream(
      AWD2_STREAM_POSITIONS,
      AWD2_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
    const matBody = buildMaterialBody('ColorMat', AWD2_MATERIAL_TYPE_COLOR, [[AWD2_MATERIAL_PROP_COLOR, 0x336699]]);
    const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [2]);

    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD2_BLOCK_MATERIAL, matBody.length),
      matBody,
      buildBlockHeader(3, AWD2_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const scene = createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body));

    const material = (getNodeChildren(scene.root)[0] as Mesh).materials[0] as ShadedMaterial | null;
    expect(material).not.toBeNull();
    expect(material!.kind).toBe(ShadedMaterialKind);
    expect(material!.modifiers).toHaveLength(0);
    expect(material!.diffuse).toBe(0x336699ff);
    expect(material!.diffuseMap).toBeNull();
  });

  it('folds the AWD alpha property (10) into the diffuse RGBA and blends when below 1', () => {
    const posStream = buildStream(
      AWD2_STREAM_POSITIONS,
      AWD2_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
    // Color 0x336699 with alpha 0.5 → diffuse 0x33669980 (0x80 = round(0.5*255)) and blend coverage.
    const matBody = buildMaterialBody('Translucent', AWD2_MATERIAL_TYPE_COLOR, [
      [AWD2_MATERIAL_PROP_COLOR, 0x336699],
      [AWD2_MATERIAL_PROP_ALPHA, float32Bits(0.5)],
    ]);
    const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [2]);
    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD2_BLOCK_MATERIAL, matBody.length),
      matBody,
      buildBlockHeader(3, AWD2_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const material = (
      getNodeChildren(createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body)).root)[0] as Mesh
    ).materials[0] as ShadedMaterial;
    expect(material.diffuse).toBe(0x33669980);
    expect(material.alphaMode).toBe('blend');
  });

  it('records a Skip diagnostic but still imports the base when an AWD material declares shading methods (numMethods > 0)', () => {
    const posStream = buildStream(
      AWD2_STREAM_POSITIONS,
      AWD2_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
    // A method-bearing material: numMethods=2. The method bodies aren't emitted (the parser doesn't walk
    // them yet); the base color must still import, with a Skip diagnostic carrying the count.
    const matBody = buildMaterialBody(
      'WithMethods',
      AWD2_MATERIAL_TYPE_COLOR,
      [[AWD2_MATERIAL_PROP_COLOR, 0x112233]],
      2,
    );
    const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [2]);
    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD2_BLOCK_MATERIAL, matBody.length),
      matBody,
      buildBlockHeader(3, AWD2_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);
    const material = (getNodeChildren(scene.root)[0] as Mesh).materials[0] as ShadedMaterial;
    expect(material.kind).toBe(ShadedMaterialKind);
    expect(material.diffuse).toBe(0x112233ff); // base still imported despite the unmapped methods
    expect(material.modifiers).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.material-methods-unsupported');
    expect(crumb.severity).toBe('Skip');
    expect(crumb.origin).toBe('resolveAwdMaterial');
    expect(crumb.detail?.methods).toBe(2);
  });

  it('imports an empty (no color, no textures) AWD material block as a default-white ShadedMaterial', () => {
    // An existing material block with no base properties is a valid material, not a drop — it defaults to
    // opaque white under the uniform-ShadedMaterial rule (regression: the early no-base-props return -1).
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromAwd2(
      buildSingleMaterialAwd(buildMaterialBody('Empty', AWD2_MATERIAL_TYPE_COLOR, [])),
      diagnostics,
    );
    const material = (getNodeChildren(scene.root)[0] as Mesh).materials[0] as ShadedMaterial | null;
    expect(material).not.toBeNull();
    expect(material!.kind).toBe(ShadedMaterialKind);
    expect(material!.diffuse).toBe(0xffffffff);
    expect(material!.diffuseMap).toBeNull();
    expect(material!.normalMap).toBeNull();
    expect(material!.modifiers).toHaveLength(0);
    expect(material!.alphaMode).toBe('opaque');
    expect(diagnostics).toHaveLength(0);
  });

  it('imports an alpha-only AWD material (no color) as white RGBA with alpha folded in and blend coverage', () => {
    // alpha 0.25 → white diffuse with alpha byte round(0.25*255)=64 (0x40) and blend coverage.
    const matBody = buildMaterialBody('AlphaOnly', AWD2_MATERIAL_TYPE_COLOR, [
      [AWD2_MATERIAL_PROP_ALPHA, float32Bits(0.25)],
    ]);
    const material = (getNodeChildren(createScene3DFromAwd2(buildSingleMaterialAwd(matBody)).root)[0] as Mesh)
      .materials[0] as ShadedMaterial;
    expect(material.kind).toBe(ShadedMaterialKind);
    expect(material.diffuse).toBe(0xffffff40);
    expect(material.alphaMode).toBe('blend');
  });

  it('imports a method-only AWD material (numMethods > 0, no base props) as a ShadedMaterial and still records a Skip diagnostic', () => {
    // Regression: this case previously dropped BEFORE the diagnostic, so both the material AND its diagnostic
    // silently disappeared. It must import a default-white ShadedMaterial and still emit the method Skip crumb.
    const diagnostics: ImportDiagnostic[] = [];
    const matBody = buildMaterialBody('MethodOnly', AWD2_MATERIAL_TYPE_COLOR, [], 3);
    const scene = createScene3DFromAwd2(buildSingleMaterialAwd(matBody), diagnostics);
    const material = (getNodeChildren(scene.root)[0] as Mesh).materials[0] as ShadedMaterial | null;
    expect(material).not.toBeNull();
    expect(material!.kind).toBe(ShadedMaterialKind);
    expect(material!.diffuse).toBe(0xffffffff);
    expect(material!.modifiers).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.material-methods-unsupported');
    expect(crumb.severity).toBe('Skip');
    expect(crumb.origin).toBe('resolveAwdMaterial');
    expect(crumb.detail?.methods).toBe(3);
  });

  it('emits an External ImageResourceReference for an external-URL texture', () => {
    const posStream = buildStream(
      AWD2_STREAM_POSITIONS,
      AWD2_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
    const texBody = buildTextureBody('http://example.com/tex.png', AWD2_TEXTURE_TYPE_EXTERNAL, new Uint8Array(0));
    const matBody = buildMaterialBody('Mat', AWD2_MATERIAL_TYPE_TEXTURE, [[AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE, 2]]);
    const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [3]);

    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD2_BLOCK_TEXTURE, texBody.length),
      texBody,
      buildBlockHeader(3, AWD2_BLOCK_MATERIAL, matBody.length),
      matBody,
      buildBlockHeader(4, AWD2_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);

    const material = (getNodeChildren(scene.root)[0] as Mesh).materials[0] as ShadedMaterial;
    expect(material.kind).toBe(ShadedMaterialKind);
    expect(getTextureSource(material.diffuseMap!)).toBeNull();
    const ref = getTestTextureResource(scene.resources, material.diffuseMap!) as ExternalImageResourceReference;
    expect(ref.kind).toBe('External');
    expect(ref.uri).toBe('http://example.com/tex.png');
    expect(ref.state).toBe(ResourceResolutionState.Unresolved);
    expect(diagnostics).toHaveLength(0);
  });

  it('emits one Unresolved ref per shared texture and never decodes during parse', () => {
    const posStream = buildStream(
      AWD2_STREAM_POSITIONS,
      AWD2_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
    const texBody = buildTextureBody('diffuse.png', AWD2_TEXTURE_TYPE_EMBEDDED, FAKE_PNG_BYTES);
    const matBody = buildMaterialBody('Mat', AWD2_MATERIAL_TYPE_TEXTURE, [[AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE, 2]]);
    const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [3]);

    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD2_BLOCK_TEXTURE, texBody.length),
      texBody,
      buildBlockHeader(3, AWD2_BLOCK_MATERIAL, matBody.length),
      matBody,
      buildBlockHeader(4, AWD2_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const scene = createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body));

    const texture = ((getNodeChildren(scene.root)[0] as Mesh).materials[0] as ShadedMaterial).diffuseMap!;
    expect(getTextureSource(texture)).toBeNull(); // parse never allocates or fills an Image
    const ref = getTestTextureResource(scene.resources, texture) as EmbeddedImageResourceReference;
    expect(ref.kind).toBe('Embedded');
    expect(ref.bytes).toEqual(FAKE_PNG_BYTES);
    expect(ref.mimeType).toBe('image/png');
    expect(ref.state).toBe(ResourceResolutionState.Unresolved);
  });

  it('emits joints0/weights0 into the skinned layout and binds the skeleton via mesh.skin', () => {
    const scene = createScene3DFromAwd2(SKINNED_TRIANGLE_AWD);
    const mesh = getNodeChildren(scene.root).find((c) => isMesh(c as Node3D)) as unknown as Mesh;
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
    // The skeleton hierarchy hangs under the "skeleton" group added to the scene. The document assembler
    // does not rethread the group as the skin's skeletonRoot (it stays null, matching every importer that
    // routes through createScene3DFromDocument); the group is still a scene-root child and the joints are
    // still parented under it.
    expect(mesh.skin?.skeletonRoot).toBeNull();
    expect(getNodeChildren(scene.root).find((c) => !isMesh(c as Node3D))?.name).toBe('skeleton');
    expect(getNodeParent(mesh.skin!.skeleton.joints[1])).toBe(mesh.skin!.skeleton.joints[0]);
  });

  it('binds the animation clip to the same joint nodes the mesh skins from (identity)', () => {
    const scene = createScene3DFromAwd2(SKINNED_TRIANGLE_AWD);
    const mesh = getNodeChildren(scene.root).find((c) => isMesh(c as Node3D)) as unknown as Mesh;
    const joints = mesh.skin!.skeleton.joints;

    // The verify contract: parse the animation over the mesh's own skeleton joints, so posing the
    // clip deforms the skinned mesh — the animation, skeleton, and skin share one joint hierarchy.
    const clip = firstAwdClip(SKINNED_TRIANGLE_AWD, joints)!;
    expect(clip).toBeDefined();
    // Each joint gets a translation channel and a rotation channel, in joint order.
    expect(clip.channels).toHaveLength(4);
    expect((clip.channels[0].targetRef as Scene3DAnimationTarget).node).toBe(joints[0]);
    expect((clip.channels[2].targetRef as Scene3DAnimationTarget).node).toBe(joints[1]);
  });

  it('leaves a non-skinned mesh with skin null even when the file carries a skeleton', () => {
    const posStream = buildStream(
      AWD2_STREAM_POSITIONS,
      AWD2_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Rigid', [{ streams: [posStream, idxStream] }]);
    const skelBody = buildSkeletonBody('Rig', [{ name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM }]);
    const miBody = buildMeshInstanceBody('RigidMesh', 0, IDENTITY_TRANSFORM, 1);

    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD2_BLOCK_SKELETON, skelBody.length),
      skelBody,
      buildBlockHeader(3, AWD2_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const scene = createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body));
    const mesh = getNodeChildren(scene.root).find((c) => isMesh(c as Node3D)) as unknown as Mesh;

    expect(mesh.geometry.layout.stride).toBe(48); // canonical (non-skinned) layout
    expect(mesh.skin == null).toBe(true);
  });
});

describe('createScene3DFromAwd2 animations', () => {
  it('returns the scene plus the skeleton animation bound to the scene’s own joints', () => {
    const scene = createScene3DFromAwd2(SKINNED_TRIANGLE_AWD);
    expect(Object.keys(scene.animations)).toHaveLength(1);

    // The clip binds the SAME joint nodes the imported scene's mesh skins from — no caller threading.
    const mesh = getNodeChildren(scene.root).find((c) => isMesh(c as Node3D)) as unknown as Mesh;
    const joints = mesh.skin!.skeleton.joints;
    const clip = Object.values(scene.animations)[0];
    // Each joint gets a translation channel and a rotation channel, in joint order.
    expect(clip.channels).toHaveLength(4);
    expect((clip.channels[0].targetRef as Scene3DAnimationTarget).node).toBe(joints[0]);
    expect((clip.channels[2].targetRef as Scene3DAnimationTarget).node).toBe(joints[1]);
  });

  it('returns no animations for a static AWD with no skeleton', () => {
    const posStream = buildStream(
      AWD2_STREAM_POSITIONS,
      AWD2_DATA_FLOAT32,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const geomBody = buildTriangleGeometryBody('Geo', [{ streams: [posStream, idxStream] }]);
    const miBody = buildMeshInstanceBody('Mesh', 0, IDENTITY_TRANSFORM, 1);
    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD2_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );
    const scene = createScene3DFromAwd2(concatBytes(buildAwdHeader(body.length), body));
    expect(Object.keys(scene.animations)).toHaveLength(0);
    expect(getNodeChildren(scene.root).length).toBeGreaterThan(0);
  });

  it('imports skeleton animations from a compressed body, not just the mesh', () => {
    // Regression: the animation re-walk must run over the DECOMPRESSED body. Away3D exports compressed by
    // default, so walking the still-deflated bytes finds no skeleton/animation blocks and silently drops
    // every clip while the mesh (walked from the rehydrated source) still imports. The uncompressed twin
    // SKINNED_TRIANGLE_AWD yields exactly one clip; the compressed file must yield the same, not zero.
    const blockStream = SKINNED_TRIANGLE_AWD.subarray(AWD2_HEADER_BYTES);
    const onDiskPayload = new Uint8Array(blockStream.length); // stand-in "compressed" bytes the stub inflates
    const compressed = concatBytes(buildAwdHeader(onDiskPayload.length, AWD2_COMPRESSION_DEFLATE), onDiskPayload);
    registerDecompressor(Compression.Deflate, () => blockStream);
    try {
      const scene = createScene3DFromAwd2(compressed);
      expect(Object.keys(scene.animations)).toHaveLength(1);
      const mesh = getNodeChildren(scene.root).find((c) => isMesh(c as Node3D)) as unknown as Mesh;
      expect(mesh.skin).not.toBeNull();
    } finally {
      unregisterDecompressor(Compression.Deflate);
    }
  });
});

describe('parseAwd2', () => {
  // A clean parse is two claims: the values are right AND THE PARSER IS NOT COMPLAINING. Every other test
  // here checks the first. This checks the second — the one that catches a walk that desynchronised and
  // still left the asserted fields looking plausible.
  //
  // It asserts the diagnostic list is EMPTY rather than filtering for truncation-shaped kind names. The
  // filter was the first version and it was wrong: `awd2.block-length-past-end` is a parse failure whose
  // name contains none of the words you would think to grep for, so a pattern built from expected
  // vocabulary silently exempted it. A good file should produce no crumbs at all, which needs no
  // vocabulary to state and cannot be defeated by a kind name nobody anticipated.
  it('raises no diagnostic at all for a well-formed file', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint16Array([0, 1, 2]);
    const geomBody = buildTriangleGeometryBody('Triangle', [
      {
        streams: [
          buildStream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, positions),
          buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, indices),
        ],
      },
    ]);
    const meshBody = buildMeshInstanceBody('TriMesh', 0, IDENTITY_TRANSFORM, 1);
    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD2_BLOCK_MESH_INSTANCE, meshBody.length),
      meshBody,
    );
    const diagnostics: ImportDiagnostic[] = [];

    parseAwd2(concatBytes(buildAwdHeader(body.length), body), diagnostics);

    const complaints = diagnostics.map((diagnostic) => diagnostic.kind);
    expect(complaints, `a good awd2 file made the parser complain: ${complaints.join(', ')}`).toEqual([]);
  });

  it('returns a format-neutral document: a mesh node names its mesh by index, roots list it', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint16Array([0, 1, 2]);
    const posStream = buildStream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, positions);
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, indices);
    const geomBody = buildTriangleGeometryBody('Triangle', [{ streams: [posStream, idxStream] }]);
    const meshBody = buildMeshInstanceBody('TriMesh', 0, IDENTITY_TRANSFORM, 1);
    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD2_BLOCK_MESH_INSTANCE, meshBody.length),
      meshBody,
    );

    const doc = parseAwd2(concatBytes(buildAwdHeader(body.length), body));
    expect(doc.meshes).toHaveLength(1);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0].name).toBe('TriMesh');
    expect(doc.nodes[0].mesh).toBe(0); // index into meshes
    expect(getMeshGeometryVertexCount(doc.meshes[0].geometry)).toBe(3);
    expect(doc.scenes).toHaveLength(1);
    expect(doc.scenes[0].rootNodes).toEqual([0]); // the mesh node is the sole root
    expect(doc.skins).toHaveLength(0);
    expect(doc.animations).toHaveLength(0);
  });

  it('wires container parenting through node children index lists', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const posStream = buildStream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, positions);
    const geomBody = buildTriangleGeometryBody('Geom', [{ streams: [posStream, idxStream] }]);
    const containerBody = buildContainerBody('Parent', 0, IDENTITY_TRANSFORM);
    const meshBody = buildMeshInstanceBody('Child', 10, IDENTITY_TRANSFORM, 1);
    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(10, AWD2_BLOCK_CONTAINER, containerBody.length),
      containerBody,
      buildBlockHeader(11, AWD2_BLOCK_MESH_INSTANCE, meshBody.length),
      meshBody,
    );

    const doc = parseAwd2(concatBytes(buildAwdHeader(body.length), body));
    const parentIndex = doc.nodes.findIndex((n) => n.name === 'Parent');
    const childIndex = doc.nodes.findIndex((n) => n.name === 'Child');
    expect(parentIndex).toBeGreaterThanOrEqual(0);
    expect(childIndex).toBeGreaterThanOrEqual(0);
    // The child is reached through the parent's children index list, not the scene roots.
    expect(doc.nodes[parentIndex].children).toContain(childIndex);
    expect(doc.scenes[0].rootNodes).toContain(parentIndex);
    expect(doc.scenes[0].rootNodes).not.toContain(childIndex);
  });

  it('decomposes a skeleton into skins (joints by node index) + node-index-bound animation channels', () => {
    const doc = parseAwd2(SKINNED_TRIANGLE_AWD);

    // The skeleton becomes a skin whose joints are document node indices, with one inverse-bind per joint.
    expect(doc.skins).toHaveLength(1);
    expect(doc.skins[0].joints).toHaveLength(2);
    expect(doc.skins[0].inverseBind).toHaveLength(2);
    for (const jointNodeIndex of doc.skins[0].joints) {
      expect(jointNodeIndex).toBeGreaterThanOrEqual(0);
      expect(jointNodeIndex).toBeLessThan(doc.nodes.length);
    }

    // The skinned mesh names the skin by index.
    const skinnedMesh = doc.meshes.find((m) => m.skin !== undefined);
    expect(skinnedMesh?.skin).toBe(0);

    // The animation's channels bind by joint node index (translation + rotation per joint).
    expect(doc.animations).toHaveLength(1);
    const channels = doc.animations[0].channels;
    expect(channels).toHaveLength(4);
    expect(channels[0].node).toBe(doc.skins[0].joints[0]);
    expect(channels[2].node).toBe(doc.skins[0].joints[1]);
  });

  it('appends resolved materials to the document materials table by index', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const posStream = buildStream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, positions);
    const geomBody = buildTriangleGeometryBody('Geom', [{ streams: [posStream, idxStream] }]);
    const matBody = buildMaterialBody('Red', AWD2_MATERIAL_TYPE_COLOR, [[AWD2_MATERIAL_PROP_COLOR, 0xff0000]]);
    const miBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [20]);
    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(20, AWD2_BLOCK_MATERIAL, matBody.length),
      matBody,
      buildBlockHeader(2, AWD2_BLOCK_MESH_INSTANCE, miBody.length),
      miBody,
    );

    const doc = parseAwd2(concatBytes(buildAwdHeader(body.length), body));
    expect(doc.materials).toHaveLength(1);
    expect(doc.materials[0].name).toBe('Red');
    // The mesh's subset references the material by its document index.
    expect(doc.meshes[0].materials).toEqual([0]);
  });

  it('records a texture block in resources and shares its reference across sampled Texture entities', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const idxStream = buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, new Uint16Array([0, 1, 2]));
    const posStream = buildStream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, positions);
    const geomBody = buildTriangleGeometryBody('Geom', [
      { streams: [posStream, idxStream] },
      { streams: [posStream, idxStream] },
    ]);
    const texBody = buildTextureBody('diffuse.png', AWD2_TEXTURE_TYPE_EMBEDDED, FAKE_PNG_BYTES);
    const firstMaterial = buildMaterialBody('First', AWD2_MATERIAL_TYPE_TEXTURE, [
      [AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE, 2],
    ]);
    const secondMaterial = buildMaterialBody('Second', AWD2_MATERIAL_TYPE_TEXTURE, [
      [AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE, 2],
    ]);
    const meshBody = buildMeshInstanceBodyWithMaterials('Mesh', 0, IDENTITY_TRANSFORM, 1, [3, 4]);
    const body = concatBytes(
      buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geomBody.length),
      geomBody,
      buildBlockHeader(2, AWD2_BLOCK_TEXTURE, texBody.length),
      texBody,
      buildBlockHeader(3, AWD2_BLOCK_MATERIAL, firstMaterial.length),
      firstMaterial,
      buildBlockHeader(4, AWD2_BLOCK_MATERIAL, secondMaterial.length),
      secondMaterial,
      buildBlockHeader(5, AWD2_BLOCK_MESH_INSTANCE, meshBody.length),
      meshBody,
    );

    const doc = parseAwd2(concatBytes(buildAwdHeader(body.length), body));
    const first = doc.materials[0] as ShadedMaterial;
    const second = doc.materials[1] as ShadedMaterial;
    expect(doc.resources).toHaveLength(1);
    expect(first.diffuseMap).not.toBe(second.diffuseMap);
    expect(getTestTextureResource(doc.resources, first.diffuseMap!)).toBe(doc.resources[0]);
    expect(getTestTextureResource(doc.resources, second.diffuseMap!)).toBe(doc.resources[0]);
  });

  it('returns an empty document with a diagnostic for compressed input', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const doc = parseAwd2(buildAwdHeader(0, AWD2_COMPRESSION_DEFLATE), diagnostics);
    expect(doc.nodes).toHaveLength(0);
    expect(doc.meshes).toHaveLength(0);
    expect(doc.scenes).toHaveLength(1);
    expect(doc.scenes[0].rootNodes).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.compression-no-decompressor');
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('rehydrateAwdBody');
    expect(crumb.detail?.compression).toBe(AWD2_COMPRESSION_DEFLATE);
  });
});

// The world-space aim a consumer resolves from a document directional light: the canonical local -Z axis
// rotated by the light's `transform`, which is exactly the composition Scene3DDocumentLight's convention
// asks of a caller. Asserting through it is what proves the file's aim survived the import — reading the
// descriptor's own direction would only ever show -Z. Rounded so exact-value comparisons stay readable.
function aimOf(light: Readonly<Scene3DDocumentLight>): number[] {
  const aim = createVector3(0, 0, -1);
  rotateVector3ByQuaternion(aim, aim, light.transform.rotation);
  return [aim.x, aim.y, aim.z].map((value) => Math.round(value * 1e6) / 1e6 + 0);
}

describe('parseAwd2 cameras', () => {
  // Camera layout: Scene3DHeader(parentId → matrix → name) → activeFlag(uint8) → lensCount(int16) →
  // projectionType(int16) → PropertyList → pivot PropertyList → UserAttrList.
  function buildCameraBody(
    name: string,
    projectionType: number,
    props: ReadonlyArray<readonly [number, Uint8Array]>,
    transform: readonly number[] = IDENTITY_TRANSFORM,
    parentId = 0,
  ): Uint8Array {
    const head = new Uint8Array(4 + 12 * 4);
    const view = new DataView(head.buffer);
    view.setUint32(0, parentId, true);
    for (let i = 0; i < 12; i++) view.setFloat32(4 + i * 4, transform[i], true);
    const lens = new Uint8Array(5);
    const lensView = new DataView(lens.buffer);
    lensView.setUint8(0, 1); // active-camera flag
    lensView.setInt16(1, 0, true); // lens count, written but unused by the format
    lensView.setInt16(3, projectionType, true);
    return concatBytes(
      head,
      buildAwdString(name),
      lens,
      buildPropertyList(props),
      buildPropertyList([]),
      buildEmptyAttrList(),
    );
  }

  function float32Prop(value: number): Uint8Array {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setFloat32(0, value, true);
    return bytes;
  }

  function parseCameraFile(
    projectionType: number,
    props: ReadonlyArray<readonly [number, Uint8Array]>,
    diagnostics?: ImportDiagnostic[],
    transform: readonly number[] = IDENTITY_TRANSFORM,
  ) {
    return parseAwd2(
      buildAwdFileOfBlocks([
        { body: buildCameraBody('Cam', projectionType, props, transform), id: 1, type: AWD2_BLOCK_CAMERA },
      ]),
      diagnostics,
    );
  }

  it('imports a perspective camera, reading the FOV as the VERTICAL angle in degrees', () => {
    const document = parseCameraFile(AWD2_CAMERA_PROJECTION_PERSPECTIVE, [[AWD2_CAMERA_PROP_FOV, float32Prop(45)]]);

    expect(document.cameras).toHaveLength(1);
    const camera = document.cameras[0];
    expect(camera.name).toBe('Cam');
    expect(camera.projection.kind).toBe('perspective');
    expect((camera.projection as { fovY: number }).fovY).toBeCloseTo((45 * Math.PI) / 180, 6);
  });

  it('takes the ecosystem projection defaults the format does not state', () => {
    // AWD carries no clip planes and no aspect on the camera block — both belong to the runtime viewport
    // — so these are Away3D's own defaults rather than invented values.
    const document = parseCameraFile(AWD2_CAMERA_PROJECTION_PERSPECTIVE, []);

    const camera = document.cameras[0];
    expect(camera.near).toBe(20);
    expect(camera.far).toBe(3000);
    expect(camera.projection).toMatchObject({ aspect: 1 });
    expect((camera.projection as { fovY: number }).fovY).toBeCloseTo((60 * Math.PI) / 180, 6);
  });

  it('carries the block matrix as the camera placement', () => {
    const placed = [1, 0, 0, 0, 1, 0, 0, 0, 1, 7, 8, 9];
    const document = parseCameraFile(AWD2_CAMERA_PROJECTION_PERSPECTIVE, [], undefined, placed);

    // AWD is left-handed and the parser negates z, the same flip every placement takes.
    expect(document.cameras[0].transform.position.x).toBeCloseTo(7, 4);
    expect(document.cameras[0].transform.position.y).toBeCloseTo(8, 4);
    expect(document.cameras[0].transform.position.z).toBeCloseTo(-9, 4);
  });

  it('imports a plain orthographic camera at the unit-scale volume', () => {
    const document = parseCameraFile(AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC, []);

    expect(document.cameras[0].projection).toMatchObject({ halfHeight: 0.5, halfWidth: 0.5, kind: 'orthographic' });
  });

  it('derives the extents of an off-center orthographic camera from its bounds', () => {
    const document = parseCameraFile(AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC_OFFCENTER, [
      [AWD2_CAMERA_PROP_ORTHO_LEFT, float32Prop(-200)],
      [AWD2_CAMERA_PROP_ORTHO_RIGHT, float32Prop(200)],
      [AWD2_CAMERA_PROP_ORTHO_BOTTOM, float32Prop(-100)],
      [AWD2_CAMERA_PROP_ORTHO_TOP, float32Prop(100)],
    ]);

    expect(document.cameras[0].projection).toMatchObject({ halfHeight: 100, halfWidth: 200 });
  });

  it('skips and reports the offset of an off-center volume Flight cannot centre', () => {
    // The extents survive; the asymmetry does not. That IS an asset fact — the author stated it.
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseCameraFile(
      AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC_OFFCENTER,
      [
        [AWD2_CAMERA_PROP_ORTHO_LEFT, float32Prop(0)],
        [AWD2_CAMERA_PROP_ORTHO_RIGHT, float32Prop(400)],
        [AWD2_CAMERA_PROP_ORTHO_BOTTOM, float32Prop(-300)],
        [AWD2_CAMERA_PROP_ORTHO_TOP, float32Prop(300)],
      ],
      diagnostics,
    );

    expect(document.cameras[0].projection).toMatchObject({ halfWidth: 200 });
    const crumb = diagnostics.find((d) => d.kind === 'awd2.camera-offcenter-dropped');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
  });

  it('skips a projection type the format does not define', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseCameraFile(9999, [], diagnostics);

    expect(document.cameras).toHaveLength(0);
    expect(diagnostics.find((d) => d.kind === 'awd2.camera-unsupported-projection')).toBeDefined();
  });

  it('no longer reports the camera block as unhandled', () => {
    // Before this handler existed, block 42 fell into the unhandled-block tally.
    const diagnostics: ImportDiagnostic[] = [];
    parseCameraFile(AWD2_CAMERA_PROJECTION_PERSPECTIVE, [], diagnostics);

    const unhandled = diagnostics.filter((d) => d.kind === 'awd2.block-unhandled');
    expect(unhandled).toHaveLength(0);
  });
});

describe('parseAwd2 lights', () => {
  it('imports a directional light and splits its ambient term into a sibling AmbientLight', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseAwd2(
      buildSingleLightAwd(
        AWD2_LIGHT_TYPE_DIRECTIONAL,
        [
          [AWD2_LIGHT_PROP_COLOR, propUint32(0xff8040)],
          [AWD2_LIGHT_PROP_DIFFUSE, propFloat32(0.7)],
          [AWD2_LIGHT_PROP_AMBIENT_COLOR, propUint32(0x203040)],
          [AWD2_LIGHT_PROP_AMBIENT, propFloat32(0.3)],
          [AWD2_LIGHT_PROP_DIRECTION_X, propFloat32(0)],
          [AWD2_LIGHT_PROP_DIRECTION_Y, propFloat32(-1)],
          [AWD2_LIGHT_PROP_DIRECTION_Z, propFloat32(0)],
        ],
        'Sun',
      ),
      diagnostics,
    );

    expect(diagnostics).toHaveLength(0);
    expect(document.lights).toHaveLength(2);

    const directional = document.lights[0];
    expect(directional.name).toBe('Sun');
    expect(directional.node).toBeUndefined();
    const sun = directional.descriptor as DirectionalLight;
    expect(sun.kind).toBe(DirectionalLightKind);
    expect(sun.color).toBe(0xff8040ff);
    expect(sun.intensity).toBeCloseTo(0.7, 6);
    expect(sun.castsShadow).toBe(false);
    // Per the document convention the descriptor aims down canonical local -Z; the aim is the transform.
    expect(sun.direction.x).toBe(0);
    expect(sun.direction.y).toBe(0);
    expect(sun.direction.z).toBe(-1);
    expect(aimOf(directional)).toEqual([0, -1, 0]);

    const ambient = document.lights[1];
    expect(ambient.name).toBe('Sun Ambient');
    const fill = ambient.descriptor as AmbientLight;
    expect(fill.kind).toBe(AmbientLightKind);
    expect(fill.color).toBe(0x203040ff);
    expect(fill.intensity).toBeCloseTo(0.3, 6);
  });

  // AWD aims in a left-handed space; Flight is right-handed, so the z component flips — the same
  // single-axis conversion every AWD placement matrix gets. The vector is normalized on the way in.
  it('converts a directional aim out of AWD left-handed space and normalizes it', () => {
    const document = parseAwd2(
      buildSingleLightAwd(AWD2_LIGHT_TYPE_DIRECTIONAL, [
        [AWD2_LIGHT_PROP_DIRECTION_X, propFloat32(0)],
        [AWD2_LIGHT_PROP_DIRECTION_Y, propFloat32(-3)],
        [AWD2_LIGHT_PROP_DIRECTION_Z, propFloat32(4)],
      ]),
    );

    // AWD's world-space aim becomes the transform's rotation off local -Z, not a descriptor direction.
    expect(aimOf(document.lights[0])).toEqual([0, -0.6, -0.8]);
  });

  // A directional light's aim comes from its AWD properties, never from the block's placement matrix —
  // Away3D applies that matrix to POINT lights only. So a block carrying both keeps the property aim and
  // stays at the origin, rather than compounding the two into a doubly-rotated light.
  it('aims a directional light from its properties and ignores the block placement matrix', () => {
    const document = parseAwd2(
      buildSingleLightAwd(
        AWD2_LIGHT_TYPE_DIRECTIONAL,
        [
          [AWD2_LIGHT_PROP_DIRECTION_X, propFloat32(0)],
          [AWD2_LIGHT_PROP_DIRECTION_Y, propFloat32(-1)],
          [AWD2_LIGHT_PROP_DIRECTION_Z, propFloat32(0)],
        ],
        'Sun',
        [0, 1, 0, -1, 0, 0, 0, 0, 1, 5, 6, 7],
      ),
    );

    const placement = document.lights[0].transform;
    expect(aimOf(document.lights[0])).toEqual([0, -1, 0]);
    expect(placement.position.x).toBe(0);
    expect(placement.position.y).toBe(0);
    expect(placement.position.z).toBe(0);
    expect(placement.scale.x).toBe(1);
  });

  it('omits the ambient light when the file gives the light no ambient term', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseAwd2(
      buildSingleLightAwd(AWD2_LIGHT_TYPE_DIRECTIONAL, [[AWD2_LIGHT_PROP_DIFFUSE, propFloat32(1)]]),
      diagnostics,
    );

    expect(diagnostics).toHaveLength(0);
    expect(document.lights).toHaveLength(1);
    expect(document.lights[0].descriptor.kind).toBe(DirectionalLightKind);
  });

  // Every light property is optional in AWD; an absent key is a DEFINED default, not a parse fault, so an
  // empty property list must import a usable white unit-intensity light and record nothing.
  it('applies the AWD defaults when the light block carries an empty property list', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseAwd2(buildSingleLightAwd(AWD2_LIGHT_TYPE_DIRECTIONAL, []), diagnostics);

    expect(diagnostics).toHaveLength(0);
    expect(document.lights).toHaveLength(1);
    const sun = document.lights[0].descriptor as DirectionalLight;
    expect(sun.color).toBe(0xffffffff);
    expect(sun.intensity).toBe(1);
    expect(sun.castsShadow).toBe(false);
    // AWD's default aim is (0, -1, 1) left-handed, which is (0, -1, -1) normalized in Flight's space.
    const [x, y, z] = aimOf(document.lights[0]);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(z).toBeCloseTo(-Math.SQRT1_2, 6);
  });

  it('marks a light that carries a shadow mapper as casting a shadow', () => {
    const document = parseAwd2(
      buildSingleLightAwd(AWD2_LIGHT_TYPE_DIRECTIONAL, [[AWD2_LIGHT_PROP_SHADOW_MAPPER, propUint8(1)]]),
    );

    expect((document.lights[0].descriptor as DirectionalLight).castsShadow).toBe(true);
  });

  it('imports a point light with its placement and its falloff cutoff as range', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseAwd2(
      buildSingleLightAwd(
        AWD2_LIGHT_TYPE_POINT,
        [
          [AWD2_LIGHT_PROP_COLOR, propUint32(0x00ff00)],
          [AWD2_LIGHT_PROP_DIFFUSE, propFloat32(2)],
          [AWD2_LIGHT_PROP_FALLOFF, propFloat32(40)],
        ],
        'Lamp',
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 3, 4, 5],
      ),
      diagnostics,
    );

    expect(diagnostics).toHaveLength(0);
    expect(document.lights).toHaveLength(1);
    const lamp = document.lights[0].descriptor as PointLight;
    expect(lamp.kind).toBe(PointLightKind);
    expect(lamp.color).toBe(0x00ff00ff);
    expect(lamp.intensity).toBe(2);
    expect(lamp.range).toBe(40);
    // Per the document convention the descriptor sits at the local origin and `transform` places it.
    expect(lamp.position.x).toBe(0);
    expect(lamp.position.y).toBe(0);
    expect(lamp.position.z).toBe(0);
    // AWD is left-handed: the placement's z flips with the rest of the file's transforms.
    const placement = document.lights[0].transform;
    expect(placement.position.x).toBeCloseTo(3, 6);
    expect(placement.position.y).toBeCloseTo(4, 6);
    expect(placement.position.z).toBeCloseTo(-5, 6);
  });

  // Away3D's falloff runs from `radius` (full brightness) to `fallOff` (zero). Flight's `range` is the
  // single cutoff, so a file that wrote the start distance loses it — and only then.
  it('records awd2.light-radius-dropped when the file writes a falloff start distance', () => {
    const diagnostics: ImportDiagnostic[] = [];
    parseAwd2(
      buildSingleLightAwd(
        AWD2_LIGHT_TYPE_POINT,
        [
          [AWD2_LIGHT_PROP_RADIUS, propFloat32(10)],
          [AWD2_LIGHT_PROP_FALLOFF, propFloat32(40)],
        ],
        'Lamp',
      ),
      diagnostics,
    );

    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.light-radius-dropped');
    expect(crumb.severity).toBe('Skip');
    expect(crumb.origin).toBe('buildAwdDocumentLights');
    expect(crumb.detail?.firstLight).toBe('Lamp');
    expect(crumb.detail?.count).toBe(1);
    expect(crumb.detail?.firstSpecular).toBeUndefined();
    expect(crumb.detail?.firstType).toBeUndefined();
  });

  it('records nothing for a point light that omits the falloff start distance', () => {
    const diagnostics: ImportDiagnostic[] = [];
    parseAwd2(buildSingleLightAwd(AWD2_LIGHT_TYPE_POINT, [[AWD2_LIGHT_PROP_FALLOFF, propFloat32(40)]]), diagnostics);

    expect(diagnostics).toHaveLength(0);
  });

  it('records awd2.light-specular-dropped when specular is scaled apart from diffuse', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseAwd2(
      buildSingleLightAwd(
        AWD2_LIGHT_TYPE_DIRECTIONAL,
        [
          [AWD2_LIGHT_PROP_DIFFUSE, propFloat32(1)],
          [AWD2_LIGHT_PROP_SPECULAR, propFloat32(0.25)],
        ],
        'Sun',
      ),
      diagnostics,
    );

    // The loss is reported, but the light still imports — a dropped specular scale is not a dropped light.
    expect(document.lights).toHaveLength(1);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.light-specular-dropped');
    expect(crumb.severity).toBe('Skip');
    expect(crumb.origin).toBe('buildAwdDocumentLights');
    expect(crumb.detail?.firstLight).toBe('Sun');
    expect(crumb.detail?.firstSpecular).toBeCloseTo(0.25, 6);
    expect(crumb.detail?.count).toBe(1);
    expect(crumb.detail?.firstType).toBeUndefined();
  });

  it('records awd2.light-unsupported-type and emits no light for a light type AWD does not define', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseAwd2(
      buildSingleLightAwd(7, [[AWD2_LIGHT_PROP_AMBIENT, propFloat32(0.5)]], 'Odd'),
      diagnostics,
    );

    // The ambient split is skipped too: an unsupported light emits NOTHING, not a bare ambient half.
    expect(document.lights).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.light-unsupported-type');
    expect(crumb.severity).toBe('Skip');
    expect(crumb.origin).toBe('buildAwdDocumentLights');
    expect(crumb.detail?.firstLight).toBe('Odd');
    expect(crumb.detail?.firstType).toBe(7);
    expect(crumb.detail?.count).toBe(1);
    expect(crumb.detail?.firstSpecular).toBeUndefined();
  });

  // Each property record is byte-length prefixed, so an exporter writing wide (float64) properties is read
  // by the record's own width — no dependence on the file's precision flag agreeing with the payload.
  it('reads wide float64 light properties', () => {
    const document = parseAwd2(
      buildSingleLightAwd(AWD2_LIGHT_TYPE_DIRECTIONAL, [
        [AWD2_LIGHT_PROP_DIFFUSE, propFloat64(0.125)],
        [AWD2_LIGHT_PROP_AMBIENT, propFloat64(0.375)],
      ]),
    );

    expect((document.lights[0].descriptor as DirectionalLight).intensity).toBe(0.125);
    expect((document.lights[1].descriptor as AmbientLight).intensity).toBe(0.375);
  });

  // A light parented to a container rides that container's node, so an animated parent carries it.
  it('binds a light to the document node its AWD parent block produced', () => {
    const containerBody = buildContainerBody('Rig', 0, IDENTITY_TRANSFORM);
    const document = parseAwd2(
      buildAwdFileOfBlocks([
        { body: containerBody, id: 4, type: AWD2_BLOCK_CONTAINER },
        {
          body: buildLightBody('Sun', 4, IDENTITY_TRANSFORM, AWD2_LIGHT_TYPE_DIRECTIONAL, [
            [AWD2_LIGHT_PROP_AMBIENT, propFloat32(0.2)],
          ]),
          id: 5,
          type: AWD2_BLOCK_LIGHT,
        },
      ]),
    );

    expect(document.nodes[0].name).toBe('Rig');
    expect(document.lights[0].node).toBe(0);
    expect(document.lights[1].node).toBe(0); // the split ambient rides the same node
  });

  it('leaves a light unbound when its AWD parent block produced no node', () => {
    const document = parseAwd2(
      buildAwdFileOfBlocks([
        {
          body: buildLightBody('Sun', 99, IDENTITY_TRANSFORM, AWD2_LIGHT_TYPE_DIRECTIONAL, []),
          id: 5,
          type: AWD2_BLOCK_LIGHT,
        },
      ]),
    );

    expect(document.lights[0].node).toBeUndefined();
  });

  // Aggregation: one crumb per KIND naming the first offender and the total, not one crumb per light.
  it('aggregates one crumb per drop kind across many lights', () => {
    const diagnostics: ImportDiagnostic[] = [];
    parseAwd2(
      buildAwdFileOfBlocks([
        {
          body: buildLightBody('First', 0, IDENTITY_TRANSFORM, AWD2_LIGHT_TYPE_DIRECTIONAL, [
            [AWD2_LIGHT_PROP_SPECULAR, propFloat32(0.5)],
          ]),
          id: 1,
          type: AWD2_BLOCK_LIGHT,
        },
        {
          body: buildLightBody('Second', 0, IDENTITY_TRANSFORM, AWD2_LIGHT_TYPE_DIRECTIONAL, [
            [AWD2_LIGHT_PROP_SPECULAR, propFloat32(0.25)],
          ]),
          id: 2,
          type: AWD2_BLOCK_LIGHT,
        },
      ]),
      diagnostics,
    );

    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.light-specular-dropped');
    expect(crumb.detail?.count).toBe(2);
    expect(crumb.detail?.firstLight).toBe('First');
    expect(crumb.detail?.firstSpecular).toBeCloseTo(0.5, 6);
  });

  // A picker that selects every light scopes nothing away: "this material's lights" and "the scene's
  // lights" are the same set, which is the shape every real AWD file in the reference corpus has.
  it('records no scope diagnostic when one picker selects every light in the file', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseAwd2(
      buildAwdFileOfBlocks([
        {
          body: buildLightBody('Sun', 0, IDENTITY_TRANSFORM, AWD2_LIGHT_TYPE_DIRECTIONAL, []),
          id: 1,
          type: AWD2_BLOCK_LIGHT,
        },
        { body: buildLightPickerBody('Picker', [1]), id: 2, type: AWD2_BLOCK_LIGHT_PICKER },
      ]),
      diagnostics,
    );

    expect(diagnostics).toHaveLength(0);
    expect(document.lights).toHaveLength(1);
  });

  // A file with no picker expressed no scoping, so there is none to drop — and the document's light table
  // is inert until a caller draws with it.
  it('records no scope diagnostic when the file declares lights but no picker', () => {
    const diagnostics: ImportDiagnostic[] = [];
    parseAwd2(buildSingleLightAwd(AWD2_LIGHT_TYPE_DIRECTIONAL, []), diagnostics);

    expect(diagnostics).toHaveLength(0);
  });

  it('records awd2.light-scope-dropped when a picker selects only some of the file lights', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseAwd2(
      buildAwdFileOfBlocks([
        {
          body: buildLightBody('Sun', 0, IDENTITY_TRANSFORM, AWD2_LIGHT_TYPE_DIRECTIONAL, []),
          id: 1,
          type: AWD2_BLOCK_LIGHT,
        },
        {
          body: buildLightBody('Fill', 0, IDENTITY_TRANSFORM, AWD2_LIGHT_TYPE_DIRECTIONAL, []),
          id: 2,
          type: AWD2_BLOCK_LIGHT,
        },
        { body: buildLightPickerBody('Partial', [1]), id: 3, type: AWD2_BLOCK_LIGHT_PICKER },
      ]),
      diagnostics,
    );

    // Both lights still import — the scoping is what is lost, not either light.
    expect(document.lights).toHaveLength(2);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.light-scope-dropped');
    expect(crumb.severity).toBe('Skip');
    expect(crumb.origin).toBe('parseAwd2');
    expect(crumb.detail?.lights).toBe(2);
    expect(crumb.detail?.pickers).toBe(1);
  });

  it('records awd2.light-picker-missing-light when a picker names a block that is not a light', () => {
    const diagnostics: ImportDiagnostic[] = [];
    parseAwd2(
      buildAwdFileOfBlocks([
        {
          body: buildLightBody('Sun', 0, IDENTITY_TRANSFORM, AWD2_LIGHT_TYPE_DIRECTIONAL, []),
          id: 1,
          type: AWD2_BLOCK_LIGHT,
        },
        { body: buildLightPickerBody('Picker', [1, 77]), id: 2, type: AWD2_BLOCK_LIGHT_PICKER },
      ]),
      diagnostics,
    );

    // Two crumbs: the dangling reference, and the scope loss it implies (the picker's set is not the
    // file's light set). Both are asserted so neither can regress into silence.
    expect(diagnostics).toHaveLength(2);
    const crumb = expectOneCrumb(diagnostics, 'awd2.light-picker-missing-light');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseAwd2');
    expect(crumb.detail?.block).toBe(2);
    expect(crumb.detail?.light).toBe(77);
    expect(expectOneCrumb(diagnostics, 'awd2.light-scope-dropped').detail?.pickers).toBe(1);
  });

  // The light and light-picker block types were previously unnamed by the dispatch and fell into the
  // unhandled-block tally. Handling them must remove them from it, not merely add lights alongside it.
  it('no longer tallies light or light-picker blocks as unhandled', () => {
    const diagnostics: ImportDiagnostic[] = [];
    parseAwd2(
      buildAwdFileOfBlocks([
        {
          body: buildLightBody('Sun', 0, IDENTITY_TRANSFORM, AWD2_LIGHT_TYPE_DIRECTIONAL, []),
          id: 1,
          type: AWD2_BLOCK_LIGHT,
        },
        { body: buildLightPickerBody('Picker', [1]), id: 2, type: AWD2_BLOCK_LIGHT_PICKER },
      ]),
      diagnostics,
    );

    expect(diagnostics.filter((d) => d.kind === 'awd2.block-unhandled')).toHaveLength(0);
  });
});

// Wraps ONE block of `blockType` at a deliberately short declared length so the parser truncates INSIDE
// it: the block carries only `fullBody`'s first `cut` bytes as its declared blockLength, and the AWD body
// is sized to exactly that block — so the walk advances to the body end after the single truncated block
// (one crumb, no trailing garbage parse). `cut` is the byte count of the fields BEFORE the truncated one.
function truncatedAwd(blockType: number, fullBody: Uint8Array, cut: number): Uint8Array {
  const body = concatBytes(buildBlockHeader(1, blockType, cut), fullBody.slice(0, cut));
  return concatBytes(buildAwdHeader(body.length), body);
}

// A VALID skeleton block followed by ONE truncated pose/animation block. Pose/animation blocks are not
// parsed by parseAwd2's first walk, so the ONLY thing that parses them on the createScene3DFromAwd2 document
// path is buildAwdDocumentAnimations — the exact call the sink-threading repair targeted. The valid
// skeleton drives that second walk (and means no no-skeleton-blocks crumb is emitted), so the truncated
// block's crumb is the sole diagnostic: this fixture regression-guards the repaired path directly.
function docPathTruncatedAwd(blockType: number, fullBody: Uint8Array, cut: number): Uint8Array {
  const skel = buildSkeletonBody('Rig', [{ name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM }]);
  const body = concatBytes(
    buildBlockHeader(1, AWD2_BLOCK_SKELETON, skel.length),
    skel,
    buildBlockHeader(2, blockType, cut),
    fullBody.slice(0, cut),
  );
  return concatBytes(buildAwdHeader(body.length), body);
}

// Bodies whose first-walk block types are parsed by createScene3DFromAwd2/parseAwd2 directly. Field cut
// offsets come from each parse function's documented layout (empty names keep every length deterministic).
const CONTAINER_BODY = buildContainerBody('', 0, IDENTITY_TRANSFORM);
const MESH_INSTANCE_BODY = buildMeshInstanceBody('', 0, IDENTITY_TRANSFORM, 1);
const MATERIAL_BODY_T = buildMaterialBody('', AWD2_MATERIAL_TYPE_COLOR, []);
const TEXTURE_BODY_T = buildTextureBody('', AWD2_TEXTURE_TYPE_EMBEDDED, FAKE_PNG_BYTES);
const SKELETON_BODY_T = buildSkeletonBody('', [{ name: '', parentIndex: 0, transform: IDENTITY_TRANSFORM }]);
const LIGHT_BODY_T = buildLightBody('', 0, IDENTITY_TRANSFORM, AWD2_LIGHT_TYPE_DIRECTIONAL, []);
const LIGHT_PICKER_BODY_T = buildLightPickerBody('', [1]);

// (blockType, body, cut) → the exact Drop crumb the createScene3DFromAwd2 first walk records. Every field
// variant of every per-block "truncated" kind, locking kind + severity + true origin + detail.field.
const CREATE_PATH_TRUNCATIONS: Array<{
  blockType: number;
  body: Uint8Array;
  bytes?: number;
  cut: number;
  field: string;
  kind: string;
  lights?: number;
  origin: string;
}> = [
  {
    blockType: AWD2_BLOCK_LIGHT,
    body: LIGHT_BODY_T,
    cut: 0,
    field: 'parentId',
    kind: 'awd2.light-truncated',
    origin: 'parseLightBlock',
  },
  {
    blockType: AWD2_BLOCK_LIGHT,
    body: LIGHT_BODY_T,
    cut: 4,
    field: 'transform',
    kind: 'awd2.light-truncated',
    origin: 'parseLightBlock',
  },
  {
    blockType: AWD2_BLOCK_LIGHT,
    body: LIGHT_BODY_T,
    cut: 52,
    field: 'name',
    kind: 'awd2.light-truncated',
    origin: 'parseLightBlock',
  },
  {
    blockType: AWD2_BLOCK_LIGHT,
    body: LIGHT_BODY_T,
    cut: 54,
    field: 'lightType',
    kind: 'awd2.light-truncated',
    origin: 'parseLightBlock',
  },
  {
    blockType: AWD2_BLOCK_LIGHT_PICKER,
    body: LIGHT_PICKER_BODY_T,
    cut: 0,
    field: 'name',
    kind: 'awd2.light-picker-truncated',
    origin: 'parseLightPickerBlock',
  },
  {
    blockType: AWD2_BLOCK_LIGHT_PICKER,
    body: LIGHT_PICKER_BODY_T,
    cut: 2,
    field: 'numLights',
    kind: 'awd2.light-picker-truncated',
    origin: 'parseLightPickerBlock',
  },
  {
    blockType: AWD2_BLOCK_LIGHT_PICKER,
    body: LIGHT_PICKER_BODY_T,
    cut: 4,
    field: 'lightIds',
    kind: 'awd2.light-picker-truncated',
    lights: 1,
    origin: 'parseLightPickerBlock',
  },
  {
    blockType: AWD2_BLOCK_CONTAINER,
    body: CONTAINER_BODY,
    cut: 0,
    field: 'parentId',
    kind: 'awd2.container-truncated',
    origin: 'parseContainerBlock',
  },
  {
    blockType: AWD2_BLOCK_CONTAINER,
    body: CONTAINER_BODY,
    cut: 4,
    field: 'transform',
    kind: 'awd2.container-truncated',
    origin: 'parseContainerBlock',
  },
  {
    blockType: AWD2_BLOCK_CONTAINER,
    body: CONTAINER_BODY,
    cut: 52,
    field: 'name',
    kind: 'awd2.container-truncated',
    origin: 'parseContainerBlock',
  },
  {
    blockType: AWD2_BLOCK_MESH_INSTANCE,
    body: MESH_INSTANCE_BODY,
    cut: 0,
    field: 'parentId',
    kind: 'awd2.mesh-instance-truncated',
    origin: 'parseMeshInstanceBlock',
  },
  {
    blockType: AWD2_BLOCK_MESH_INSTANCE,
    body: MESH_INSTANCE_BODY,
    cut: 4,
    field: 'transform',
    kind: 'awd2.mesh-instance-truncated',
    origin: 'parseMeshInstanceBlock',
  },
  {
    blockType: AWD2_BLOCK_MESH_INSTANCE,
    body: MESH_INSTANCE_BODY,
    cut: 52,
    field: 'name',
    kind: 'awd2.mesh-instance-truncated',
    origin: 'parseMeshInstanceBlock',
  },
  {
    blockType: AWD2_BLOCK_MESH_INSTANCE,
    body: MESH_INSTANCE_BODY,
    cut: 54,
    field: 'geometryId',
    kind: 'awd2.mesh-instance-truncated',
    origin: 'parseMeshInstanceBlock',
  },
  {
    blockType: AWD2_BLOCK_MATERIAL,
    body: MATERIAL_BODY_T,
    cut: 0,
    field: 'name',
    kind: 'awd2.material-truncated',
    origin: 'parseMaterialBlock',
  },
  {
    blockType: AWD2_BLOCK_MATERIAL,
    body: MATERIAL_BODY_T,
    cut: 2,
    field: 'type',
    kind: 'awd2.material-truncated',
    origin: 'parseMaterialBlock',
  },
  {
    blockType: AWD2_BLOCK_TEXTURE,
    body: TEXTURE_BODY_T,
    cut: 0,
    field: 'name',
    kind: 'awd2.texture-truncated',
    origin: 'parseTextureBlock',
  },
  {
    blockType: AWD2_BLOCK_TEXTURE,
    body: TEXTURE_BODY_T,
    cut: 2,
    field: 'payload',
    kind: 'awd2.texture-truncated',
    origin: 'parseTextureBlock',
  },
  {
    blockType: AWD2_BLOCK_TEXTURE,
    body: TEXTURE_BODY_T,
    bytes: FAKE_PNG_BYTES.length,
    cut: 7,
    field: 'data',
    kind: 'awd2.texture-truncated',
    origin: 'parseTextureBlock',
  },
  {
    blockType: AWD2_BLOCK_SKELETON,
    body: SKELETON_BODY_T,
    cut: 0,
    field: 'name',
    kind: 'awd2.skeleton-truncated',
    origin: 'parseSkeletonBlock',
  },
  {
    blockType: AWD2_BLOCK_SKELETON,
    body: SKELETON_BODY_T,
    cut: 2,
    field: 'jointCount',
    kind: 'awd2.skeleton-truncated',
    origin: 'parseSkeletonBlock',
  },
  {
    blockType: AWD2_BLOCK_SKELETON,
    body: SKELETON_BODY_T,
    cut: 8,
    field: 'jointFields',
    kind: 'awd2.skeleton-truncated',
    origin: 'parseSkeletonBlock',
  },
  {
    blockType: AWD2_BLOCK_SKELETON,
    body: SKELETON_BODY_T,
    cut: 12,
    field: 'jointName',
    kind: 'awd2.skeleton-truncated',
    origin: 'parseSkeletonBlock',
  },
  {
    blockType: AWD2_BLOCK_SKELETON,
    body: SKELETON_BODY_T,
    cut: 14,
    field: 'jointTransform',
    kind: 'awd2.skeleton-truncated',
    origin: 'parseSkeletonBlock',
  },
];

// Pose/animation blocks are NOT parsed by the first walk; parseAwd2SkeletonAnimations is their reporting
// site (it also returns {} with a no-skeleton-blocks crumb, which expectOneCrumb ignores by kind).
const POSE_BODY_T = buildSkeletonPoseBody('', [IDENTITY_TRANSFORM]);
const ANIM_BODY_T = buildSkeletonAnimationBody('', [{ duration: 100, poseBlockId: 1 }]);
const ANIM_PATH_TRUNCATIONS: Array<{
  blockType: number;
  body: Uint8Array;
  cut: number;
  field: string;
  kind: string;
  origin: string;
}> = [
  {
    blockType: AWD2_BLOCK_SKELETON_POSE,
    body: POSE_BODY_T,
    cut: 0,
    field: 'name',
    kind: 'awd2.skeleton-pose-truncated',
    origin: 'parseSkeletonPoseBlock',
  },
  {
    blockType: AWD2_BLOCK_SKELETON_POSE,
    body: POSE_BODY_T,
    cut: 2,
    field: 'jointCount',
    kind: 'awd2.skeleton-pose-truncated',
    origin: 'parseSkeletonPoseBlock',
  },
  {
    blockType: AWD2_BLOCK_SKELETON_POSE,
    body: POSE_BODY_T,
    cut: 8,
    field: 'hasTransform',
    kind: 'awd2.skeleton-pose-truncated',
    origin: 'parseSkeletonPoseBlock',
  },
  {
    blockType: AWD2_BLOCK_SKELETON_POSE,
    body: POSE_BODY_T,
    cut: 9,
    field: 'jointTransform',
    kind: 'awd2.skeleton-pose-truncated',
    origin: 'parseSkeletonPoseBlock',
  },
  {
    blockType: AWD2_BLOCK_SKELETON_ANIMATION,
    body: ANIM_BODY_T,
    cut: 0,
    field: 'name',
    kind: 'awd2.skeleton-animation-truncated',
    origin: 'parseSkeletonAnimationBlock',
  },
  {
    blockType: AWD2_BLOCK_SKELETON_ANIMATION,
    body: ANIM_BODY_T,
    cut: 2,
    field: 'frameCount',
    kind: 'awd2.skeleton-animation-truncated',
    origin: 'parseSkeletonAnimationBlock',
  },
  {
    blockType: AWD2_BLOCK_SKELETON_ANIMATION,
    body: ANIM_BODY_T,
    cut: 8,
    field: 'poseBlockId',
    kind: 'awd2.skeleton-animation-truncated',
    origin: 'parseSkeletonAnimationBlock',
  },
  {
    blockType: AWD2_BLOCK_SKELETON_ANIMATION,
    body: ANIM_BODY_T,
    cut: 12,
    field: 'poseDuration',
    kind: 'awd2.skeleton-animation-truncated',
    origin: 'parseSkeletonAnimationBlock',
  },
];

describe('parseAwd2 unhandled blocks', () => {
  // Two CORE block types the dispatch genuinely does not name. Both appear in the reference AWD corpus
  // (shambler carries one of each), so these exercise the tally against real unwritten format coverage
  // rather than invented numbers — and are the fixtures to change when either type gains a parser.
  const UNHANDLED_BLOCK_TYPE = 113;
  const OTHER_UNHANDLED_BLOCK_TYPE = 122;

  // One block of `blockType` in `namespace`, carrying `payload` bytes the parser will not look at.
  function fileWithBlocks(
    blocks: ReadonlyArray<{ blockId: number; blockType: number; namespace?: number }>,
  ): Uint8Array {
    const parts: Uint8Array[] = [];
    for (const block of blocks) {
      parts.push(buildBlockHeader(block.blockId, block.blockType, 4, 0, block.namespace ?? AWD2_NAMESPACE_CORE));
      parts.push(new Uint8Array(4));
    }
    const body = concatBytes(...parts);
    return concatBytes(buildAwdHeader(body.length), body);
  }

  it('reports a CORE block type the dispatch does not name', () => {
    // The silence this replaces was the real defect: the offset advanced, the block vanished, and a file
    // using a format feature nobody has written was indistinguishable from a file that uses none.
    const diagnostics: ImportDiagnostic[] = [];
    parseAwd2(fileWithBlocks([{ blockId: 7, blockType: UNHANDLED_BLOCK_TYPE }]), diagnostics);

    expect(diagnostics).toEqual([
      {
        detail: { blockType: UNHANDLED_BLOCK_TYPE, count: 1, firstBlockId: 7, namespace: AWD2_NAMESPACE_CORE },
        kind: 'awd2.block-unhandled',
        origin: 'parseAwd2',
        severity: ImportDiagnosticSeverity.Drop,
      },
    ]);
  });

  it('reports a block in a namespace that is not CORE', () => {
    const diagnostics: ImportDiagnostic[] = [];
    parseAwd2(fileWithBlocks([{ blockId: 3, blockType: AWD2_BLOCK_TRIANGLE_GEOMETRY, namespace: 5 }]), diagnostics);

    // Reported even though the TYPE is one we handle, because in another namespace it is somebody else's
    // block that merely shares a number.
    expect(diagnostics.map((d) => d.detail)).toEqual([
      { blockType: AWD2_BLOCK_TRIANGLE_GEOMETRY, count: 1, firstBlockId: 3, namespace: 5 },
    ]);
  });

  it('reports one diagnostic per distinct block type, with the count and the first block id', () => {
    // An unknown type usually repeats once per object in the file. Reporting each occurrence would bury
    // every other diagnostic; the count is what tells a reader how much of the file was dropped.
    const diagnostics: ImportDiagnostic[] = [];
    parseAwd2(
      fileWithBlocks([
        { blockId: 10, blockType: UNHANDLED_BLOCK_TYPE },
        { blockId: 11, blockType: UNHANDLED_BLOCK_TYPE },
        { blockId: 12, blockType: OTHER_UNHANDLED_BLOCK_TYPE },
        { blockId: 13, blockType: UNHANDLED_BLOCK_TYPE },
      ]),
      diagnostics,
    );

    expect(diagnostics.map((d) => d.detail)).toEqual([
      { blockType: UNHANDLED_BLOCK_TYPE, count: 3, firstBlockId: 10, namespace: AWD2_NAMESPACE_CORE },
      { blockType: OTHER_UNHANDLED_BLOCK_TYPE, count: 1, firstBlockId: 12, namespace: AWD2_NAMESPACE_CORE },
    ]);
  });

  it('reports nothing for skeleton pose and skeleton animation blocks', () => {
    // These are consumed by the SECOND walk (buildAwdDocumentAnimations), which re-reads the block stream
    // once the joint nodes exist. The first walk passing over them is deferral, not a gap — reporting
    // them would put a false Drop on every skinned AWD file, including ones that import perfectly.
    const diagnostics: ImportDiagnostic[] = [];
    parseAwd2(
      fileWithBlocks([
        { blockId: 20, blockType: AWD2_BLOCK_SKELETON_POSE },
        { blockId: 21, blockType: AWD2_BLOCK_SKELETON_ANIMATION },
      ]),
      diagnostics,
    );

    expect(diagnostics.filter((d) => d.kind === 'awd2.block-unhandled')).toEqual([]);
  });

  it('reports nothing for a file whose blocks the dispatch all handles', () => {
    // Guards the guard: if this fired on ordinary content the diagnostic would be noise, and every test
    // above would pass just as well against a parser that reported unconditionally.
    const diagnostics: ImportDiagnostic[] = [];
    parseAwd2(SKINNED_TRIANGLE_AWD, diagnostics);

    expect(diagnostics.filter((d) => d.kind === 'awd2.block-unhandled')).toEqual([]);
  });
});

describe('parseAwd2SkeletonAnimations', () => {
  it('rejects a version-3 (AWD3) file by version with an empty map and an AWD3-naming diagnostic', () => {
    const awd3 = buildAwdHeader(0, 0, 0, 3);
    const diagnostics: ImportDiagnostic[] = [];
    const clips = parseAwd2SkeletonAnimations(awd3, [], diagnostics);
    expect(Object.keys(clips)).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.unsupported-version');
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('isAwd2Version');
    expect(crumb.detail?.version).toBe(3);
  });

  it('binds channels to the provided joint nodes in skeleton order', () => {
    // parentIndex 0 = root (no parent); parentIndex 1 = parent is joint[0] (1-based).
    const skeletonBody = buildSkeletonBody('TestSkeleton', [
      { name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM },
      {
        name: 'Child',
        parentIndex: 1,
        transform: [1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 0, 0],
      },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD2_BLOCK_SKELETON, skeletonBody.length);

    const pose0Body = buildSkeletonPoseBody('Pose0', [IDENTITY_TRANSFORM, [1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 0, 0]]);
    const pose0Block = buildBlockHeader(2, AWD2_BLOCK_SKELETON_POSE, pose0Body.length);

    const pose1Body = buildSkeletonPoseBody('Pose1', [IDENTITY_TRANSFORM, [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 0, 0]]);
    const pose1Block = buildBlockHeader(3, AWD2_BLOCK_SKELETON_POSE, pose1Body.length);

    const animBody = buildSkeletonAnimationBody('Walk', [
      { duration: 500, poseBlockId: 2 },
      { duration: 500, poseBlockId: 3 },
    ]);
    const animBlock = buildBlockHeader(4, AWD2_BLOCK_SKELETON_ANIMATION, animBody.length);

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

    const joints = [createNode3D(), createNode3D()];
    const clip = firstAwdClip(awd, joints);
    expect(clip).toBeDefined();

    // Each joint gets a translation channel and a rotation channel, in joint order.
    expect(clip!.channels).toHaveLength(4);
    expect(clip!.duration).toBeCloseTo(1.0);
    expect((clip!.channels[0].targetRef as Scene3DAnimationTarget).node).toBe(joints[0]);
    expect((clip!.channels[0].targetRef as Scene3DAnimationTarget).path).toBe('Translation');
    expect((clip!.channels[1].targetRef as Scene3DAnimationTarget).path).toBe('Rotation');
    expect((clip!.channels[2].targetRef as Scene3DAnimationTarget).node).toBe(joints[1]);
  });

  it('samples animation clip translation values correctly', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Joint0', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD2_BLOCK_SKELETON, skeletonBody.length);

    const pose0Body = buildSkeletonPoseBody('P0', [[1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]]);
    const pose0Block = buildBlockHeader(2, AWD2_BLOCK_SKELETON_POSE, pose0Body.length);

    const pose1Body = buildSkeletonPoseBody('P1', [[1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 20, 30]]);
    const pose1Block = buildBlockHeader(3, AWD2_BLOCK_SKELETON_POSE, pose1Body.length);

    const animBody = buildSkeletonAnimationBody('Anim', [
      { duration: 1000, poseBlockId: 2 },
      { duration: 1000, poseBlockId: 3 },
    ]);
    const animBlock = buildBlockHeader(4, AWD2_BLOCK_SKELETON_ANIMATION, animBody.length);

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

    const clip = firstAwdClip(awd, [createNode3D()])!;
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

  it('emits a per-joint scale channel with the decomposed pose scale', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Joint0', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD2_BLOCK_SKELETON, skeletonBody.length);
    const pose0Body = buildSkeletonPoseBody('P0', [[1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]]);
    const pose0Block = buildBlockHeader(2, AWD2_BLOCK_SKELETON_POSE, pose0Body.length);
    // A diagonal 2/3/4 scale basis. convertTransformLhToRh (S·M·S) preserves diagonal scale, so it
    // decomposes back to exactly (2,3,4).
    const pose1Body = buildSkeletonPoseBody('P1', [[2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0]]);
    const pose1Block = buildBlockHeader(3, AWD2_BLOCK_SKELETON_POSE, pose1Body.length);
    const animBody = buildSkeletonAnimationBody('Anim', [
      { duration: 1000, poseBlockId: 2 },
      { duration: 1000, poseBlockId: 3 },
    ]);
    const animBlock = buildBlockHeader(4, AWD2_BLOCK_SKELETON_ANIMATION, animBody.length);
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

    const clip = firstAwdClip(awd, [createNode3D()])!;
    const scaleChannel = clip.channels.find((c) => (c.targetRef as Scene3DAnimationTarget).path === 'Scale');
    expect(scaleChannel).toBeDefined();
    expect(scaleChannel!.track.components).toBe(3);

    const out = [0, 0, 0];
    sampleAnimationTrack(out, scaleChannel!.track, 0);
    expect(out.map((v) => Number(v.toFixed(3)))).toEqual([1, 1, 1]);
    sampleAnimationTrack(out, scaleChannel!.track, 1);
    expect(out.map((v) => Number(v.toFixed(3)))).toEqual([2, 3, 4]);
  });

  it('omits the scale channel for identity-scale skeletons', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Joint0', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD2_BLOCK_SKELETON, skeletonBody.length);
    const pose0Body = buildSkeletonPoseBody('P0', [[1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]]);
    const pose0Block = buildBlockHeader(2, AWD2_BLOCK_SKELETON_POSE, pose0Body.length);
    const pose1Body = buildSkeletonPoseBody('P1', [[1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 0, 0]]);
    const pose1Block = buildBlockHeader(3, AWD2_BLOCK_SKELETON_POSE, pose1Body.length);
    const animBody = buildSkeletonAnimationBody('Anim', [
      { duration: 1000, poseBlockId: 2 },
      { duration: 1000, poseBlockId: 3 },
    ]);
    const animBlock = buildBlockHeader(4, AWD2_BLOCK_SKELETON_ANIMATION, animBody.length);
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

    const clip = firstAwdClip(awd, [createNode3D()])!;
    expect(clip.channels.some((c) => (c.targetRef as Scene3DAnimationTarget).path === 'Scale')).toBe(false);
    // Only translation + rotation for the single joint.
    expect(clip.channels).toHaveLength(2);
  });

  it('uses Scene3DAnimationTarget as channel targetRef', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Bone', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD2_BLOCK_SKELETON, skeletonBody.length);

    const poseBody = buildSkeletonPoseBody('P0', [IDENTITY_TRANSFORM]);
    const poseBlock = buildBlockHeader(2, AWD2_BLOCK_SKELETON_POSE, poseBody.length);

    const animBody = buildSkeletonAnimationBody('Anim', [{ duration: 100, poseBlockId: 2 }]);
    const animBlock = buildBlockHeader(3, AWD2_BLOCK_SKELETON_ANIMATION, animBody.length);

    const body = concatBytes(skeletonBlock, skeletonBody, poseBlock, poseBody, animBlock, animBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const joints = [createNode3D()];
    const clip = firstAwdClip(awd, joints)!;
    const target = clip.channels[0].targetRef as Scene3DAnimationTarget;
    expect(target.node).toBe(joints[0]);
    expect(target.path).toBe('Translation');
  });

  it('handles poses with missing transforms using identity translation', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Joint0', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD2_BLOCK_SKELETON, skeletonBody.length);

    const poseBody = buildSkeletonPoseBody('P0', [null]);
    const poseBlock = buildBlockHeader(2, AWD2_BLOCK_SKELETON_POSE, poseBody.length);

    const animBody = buildSkeletonAnimationBody('Anim', [{ duration: 100, poseBlockId: 2 }]);
    const animBlock = buildBlockHeader(3, AWD2_BLOCK_SKELETON_ANIMATION, animBody.length);

    const body = concatBytes(skeletonBlock, skeletonBody, poseBlock, poseBody, animBlock, animBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const clip = firstAwdClip(awd, [createNode3D()])!;
    const out = [0, 0, 0];
    sampleAnimationTrack(out, clip.channels[0].track, 0);
    expect(out).toEqual([0, 0, 0]);
  });

  it('returns null and records a diagnostic when the joints array is shorter than the skeleton', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM },
      { name: 'Child', parentIndex: 1, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD2_BLOCK_SKELETON, skeletonBody.length);

    const poseBody = buildSkeletonPoseBody('P0', [IDENTITY_TRANSFORM, IDENTITY_TRANSFORM]);
    const poseBlock = buildBlockHeader(2, AWD2_BLOCK_SKELETON_POSE, poseBody.length);

    const animBody = buildSkeletonAnimationBody('Anim', [{ duration: 100, poseBlockId: 2 }]);
    const animBlock = buildBlockHeader(3, AWD2_BLOCK_SKELETON_ANIMATION, animBody.length);

    const body = concatBytes(skeletonBlock, skeletonBody, poseBlock, poseBody, animBlock, animBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const diagnostics: ImportDiagnostic[] = [];
    const clip = firstAwdClip(awd, [createNode3D()], diagnostics);
    expect(clip).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.joint-count-mismatch');
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('parseAwd2SkeletonAnimations');
    expect(crumb.detail?.jointNodes).toBe(1);
    expect(crumb.detail?.skeletonJoints).toBe(2);
  });

  it('returns null and records a diagnostic when no skeleton blocks are found', () => {
    const awd = buildAwdHeader(0);
    const diagnostics: ImportDiagnostic[] = [];
    const clip = firstAwdClip(awd, [], diagnostics);
    expect(clip).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.no-skeleton-blocks');
    expect(crumb.detail).toBeUndefined();
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('parseAwd2SkeletonAnimations');
  });

  it('returns null and records a diagnostic when no animation blocks are found', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD2_BLOCK_SKELETON, skeletonBody.length);

    const body = concatBytes(skeletonBlock, skeletonBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const diagnostics: ImportDiagnostic[] = [];
    const clip = firstAwdClip(awd, [createNode3D()], diagnostics);
    expect(clip).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.no-skeleton-animation-blocks');
    expect(crumb.detail).toBeUndefined();
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('parseAwd2SkeletonAnimations');
  });

  it('returns null and records a diagnostic for truncated input', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const clip = firstAwdClip(new Uint8Array(4), [], diagnostics);
    expect(clip).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.header-too-short');
    expect(crumb.detail).toBeUndefined();
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('parseAwd2SkeletonAnimations');
  });

  it('returns null and records a diagnostic for invalid magic', () => {
    const bogus = new Uint8Array(12);
    const diagnostics: ImportDiagnostic[] = [];
    const clip = firstAwdClip(bogus, [], diagnostics);
    expect(clip).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.bad-magic');
    expect(crumb.detail).toBeUndefined();
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('parseAwd2SkeletonAnimations');
  });

  it('records a diagnostic when animation references a missing pose block', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD2_BLOCK_SKELETON, skeletonBody.length);

    const animBody = buildSkeletonAnimationBody('Anim', [{ duration: 100, poseBlockId: 99 }]);
    const animBlock = buildBlockHeader(2, AWD2_BLOCK_SKELETON_ANIMATION, animBody.length);

    const body = concatBytes(skeletonBlock, skeletonBody, animBlock, animBody);
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const diagnostics: ImportDiagnostic[] = [];
    const clip = firstAwdClip(awd, [createNode3D()], diagnostics);
    expect(clip).toBeDefined();
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.pose-block-missing');
    expect(crumb.severity).toBe('Recover');
    expect(crumb.origin).toBe('buildAwdSkeletonAnimationClip');
    expect(crumb.detail?.distinctPoseBlocks).toBe(1);
    expect(crumb.detail?.firstPoseBlock).toBe(99);
  });

  it('converts pose durations from milliseconds to seconds in keyframe times', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD2_BLOCK_SKELETON, skeletonBody.length);

    const pose0Body = buildSkeletonPoseBody('P0', [IDENTITY_TRANSFORM]);
    const pose0Block = buildBlockHeader(2, AWD2_BLOCK_SKELETON_POSE, pose0Body.length);

    const pose1Body = buildSkeletonPoseBody('P1', [IDENTITY_TRANSFORM]);
    const pose1Block = buildBlockHeader(3, AWD2_BLOCK_SKELETON_POSE, pose1Body.length);

    const animBody = buildSkeletonAnimationBody('Anim', [
      { duration: 250, poseBlockId: 2 },
      { duration: 750, poseBlockId: 3 },
    ]);
    const animBlock = buildBlockHeader(4, AWD2_BLOCK_SKELETON_ANIMATION, animBody.length);

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

    const clip = firstAwdClip(awd, [createNode3D()])!;
    expect(clip.duration).toBeCloseTo(1.0);

    const track = clip.channels[0].track;
    expect(track.times[0]).toBeCloseTo(0);
    expect(track.times[1]).toBeCloseTo(0.25);
  });

  it('keys every named animation block into the map', () => {
    const skeletonBody = buildSkeletonBody('Skeleton', [
      { name: 'Root', parentIndex: 0, transform: IDENTITY_TRANSFORM },
    ]);
    const skeletonBlock = buildBlockHeader(1, AWD2_BLOCK_SKELETON, skeletonBody.length);

    // Two poses at distinct X so each animation's sampled translation is distinguishable.
    const idlePoseBody = buildSkeletonPoseBody('IdlePose', [[1, 0, 0, 0, 1, 0, 0, 0, 1, 3, 0, 0]]);
    const idlePoseBlock = buildBlockHeader(2, AWD2_BLOCK_SKELETON_POSE, idlePoseBody.length);
    const attackPoseBody = buildSkeletonPoseBody('AttackPose', [[1, 0, 0, 0, 1, 0, 0, 0, 1, 9, 0, 0]]);
    const attackPoseBlock = buildBlockHeader(3, AWD2_BLOCK_SKELETON_POSE, attackPoseBody.length);

    // 'idle' first in file order, 'attack' second — order is what default selection falls back to.
    const idleAnimBody = buildSkeletonAnimationBody('idle', [{ duration: 100, poseBlockId: 2 }]);
    const idleAnimBlock = buildBlockHeader(4, AWD2_BLOCK_SKELETON_ANIMATION, idleAnimBody.length);
    const attackAnimBody = buildSkeletonAnimationBody('attack', [{ duration: 100, poseBlockId: 3 }]);
    const attackAnimBlock = buildBlockHeader(5, AWD2_BLOCK_SKELETON_ANIMATION, attackAnimBody.length);

    const body = concatBytes(
      skeletonBlock,
      skeletonBody,
      idlePoseBlock,
      idlePoseBody,
      attackPoseBlock,
      attackPoseBody,
      idleAnimBlock,
      idleAnimBody,
      attackAnimBlock,
      attackAnimBody,
    );
    const awd = concatBytes(buildAwdHeader(body.length), body);

    const sampleX = (clip: AnimationClip): number => {
      const out = [0, 0, 0];
      sampleAnimationTrack(out, clip.channels[0].track, 0);
      return out[0];
    };

    // Every named block is keyed into the map, each sampling its own poses ('idle' X=3, 'attack' X=9).
    const clips = parseAwd2SkeletonAnimations(awd, [createNode3D()]);
    expect(Object.keys(clips).sort()).toEqual(['attack', 'idle']);
    expect(sampleX(clips.idle)).toBeCloseTo(3);
    expect(sampleX(clips.attack)).toBeCloseTo(9);
  });
});

describe('rehydrateAwdBody', () => {
  // A trivial reversible "codec": the compressed body is a 4-byte marker followed by the real block
  // stream, and the decompressor strips the marker. A compressed length that differs from the inflated
  // length exercises the header body-length rewrite the rehydration performs.
  const MARKER = [0xde, 0xad, 0xbe, 0xef];
  const stripMarker: Decompressor = (compressed) => compressed.subarray(MARKER.length);

  // Re-wraps an uncompressed AWD as a `method`-compressed file whose body is `MARKER + originalBody`.
  const asCompressed = (uncompressed: Uint8Array, method: number): Uint8Array => {
    const payload = concatBytes(new Uint8Array(MARKER), uncompressed.subarray(12));
    const header = uncompressed.slice(0, 12);
    header[7] = method;
    new DataView(header.buffer).setUint32(8, payload.length, true);
    return concatBytes(header, payload);
  };

  afterEach(() => {
    unregisterDecompressor(Compression.Deflate);
    unregisterDecompressor(Compression.Lzma);
  });

  it('inflates a compressed geometry file through the registered codec, matching the uncompressed parse', () => {
    registerDecompressor(Compression.Deflate, stripMarker);
    const fromCompressed = parseAwd2(asCompressed(SKINNED_TRIANGLE_AWD, AWD2_COMPRESSION_DEFLATE));
    const fromUncompressed = parseAwd2(SKINNED_TRIANGLE_AWD);
    expect(fromCompressed.meshes).toHaveLength(fromUncompressed.meshes.length);
    expect(fromCompressed.nodes).toHaveLength(fromUncompressed.nodes.length);
    expect(getMeshGeometryVertexCount(fromCompressed.meshes[0].geometry)).toBe(
      getMeshGeometryVertexCount(fromUncompressed.meshes[0].geometry),
    );
  });

  it('routes compressed skeleton-animation files through the same seam', () => {
    registerDecompressor(Compression.Deflate, stripMarker);
    const joints = [createNode3D(), createNode3D()];
    const compressed = asCompressed(SKINNED_TRIANGLE_AWD, AWD2_COMPRESSION_DEFLATE);
    const clip = firstAwdClip(compressed, joints);
    expect(clip).toBeDefined();
    expect(clip!.channels).toHaveLength(4); // 2 joints × (translation + rotation)
  });

  it('records a diagnostic and returns empty when the compression method has no registered codec', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromAwd2(asCompressed(SKINNED_TRIANGLE_AWD, AWD2_COMPRESSION_DEFLATE), diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.compression-no-decompressor');
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('rehydrateAwdBody');
    expect(crumb.detail?.compression).toBe(AWD2_COMPRESSION_DEFLATE);
  });

  it('records a diagnostic and returns empty when the registered codec fails to inflate', () => {
    registerDecompressor(Compression.Deflate, () => null);
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromAwd2(asCompressed(SKINNED_TRIANGLE_AWD, AWD2_COMPRESSION_DEFLATE), diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.decompression-failed');
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('rehydrateAwdBody');
    expect(crumb.detail?.compression).toBe(AWD2_COMPRESSION_DEFLATE);
  });

  it('clears a codec when registered with null', () => {
    registerDecompressor(Compression.Deflate, stripMarker);
    unregisterDecompressor(Compression.Deflate);
    const diagnostics: ImportDiagnostic[] = [];
    parseAwd2(asCompressed(SKINNED_TRIANGLE_AWD, AWD2_COMPRESSION_DEFLATE), diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'awd2.compression-no-decompressor');
    expect(crumb.origin).toBe('rehydrateAwdBody');
    expect(crumb.detail?.compression).toBe(AWD2_COMPRESSION_DEFLATE);
  });

  // The real end-to-end (Away3D zlib-compresses the body; the vendored inflater reconstructs the identical
  // scene) uses a fixture precompressed offline, since this browser-clean package's build carries no
  // node:zlib. Provenance — generated once with node v22.22.1 from the SKINNED_TRIANGLE_AWD body above:
  //   Buffer.from(deflateSync(SKINNED_TRIANGLE_AWD.subarray(12))).toString('base64')
  // The assertion is self-checking: if SKINNED_TRIANGLE_AWD ever changes, the stale fixture inflates to a
  // different body and the scene-equivalence check fails rather than passing silently.
  const SKINNED_BODY_COMPRESSED =
    'eJxjZAACRoZGIMnOEJydmZeXmsIIEmPIY4AARnYVBnTQYI+Nz8TKBtHBwMTAxs4DZYMwiGRnlwCLOADVNtgBGfYQjDCLCUSkMkwAkswMQZnpTHDzWRiC8vNLcNmLmw/1ARCyMjhnZOakEGfEAgd0I5hBhDiDP9E2o/K5YUHrm1qcwYiikBVEpDHkMID8H2DABHUxiRaQrIENxVpDkqxVcCTDWogmdhCRzgBKCSwM4Yk52RCLQYHwhZENTAIA8+wq1A==';

  // Minimal, dependency-free base64 decoder (no atob/Buffer) — keeps the test browser-clean.
  const decodeBase64 = (input: string): Uint8Array => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = new Uint8Array(128);
    for (let i = 0; i < alphabet.length; i++) lookup[alphabet.charCodeAt(i)] = i;
    const clean = input.replace(/=+$/, '');
    const out = new Uint8Array((clean.length * 3) >> 2);
    let acc = 0;
    let bits = 0;
    let o = 0;
    for (let i = 0; i < clean.length; i++) {
      acc = (acc << 6) | lookup[clean.charCodeAt(i)];
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out[o++] = (acc >> bits) & 0xff;
      }
    }
    return out;
  };

  it('reconstructs the identical scene from a genuinely zlib-compressed AWD via the vendored inflater', () => {
    registerDeflateDecompressor();
    const compressedBody = decodeBase64(SKINNED_BODY_COMPRESSED);
    const header = SKINNED_TRIANGLE_AWD.slice(0, 12);
    header[7] = AWD2_COMPRESSION_DEFLATE;
    new DataView(header.buffer).setUint32(8, compressedBody.length, true);

    const fromCompressed = parseAwd2(concatBytes(header, compressedBody));
    const fromUncompressed = parseAwd2(SKINNED_TRIANGLE_AWD);
    expect(fromCompressed.meshes).toHaveLength(fromUncompressed.meshes.length);
    expect(fromCompressed.nodes).toHaveLength(fromUncompressed.nodes.length);
    expect(getMeshGeometryVertexCount(fromCompressed.meshes[0].geometry)).toBe(
      getMeshGeometryVertexCount(fromUncompressed.meshes[0].geometry),
    );
    // The skinned mesh's joints0/weights0 survive the real inflate too (skin binding intact).
    expect(fromCompressed.skins).toHaveLength(fromUncompressed.skins.length);
  });
});
