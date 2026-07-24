// AWD2 core constants used by this tiny, authored fixture. Keeping the binary construction here makes the
// example self-contained and avoids redistributing an asset exported by Away3D or another third party.
const AWD2_BLOCK_MATERIAL = 81;
const AWD2_BLOCK_MESH_INSTANCE = 23;
const AWD2_BLOCK_TRIANGLE_GEOMETRY = 1;
const AWD2_DATA_FLOAT32 = 7;
const AWD2_DATA_UINT16 = 5;
const AWD2_MATERIAL_PROP_COLOR = 1;
const AWD2_MATERIAL_TYPE_COLOR = 1;
const AWD2_NAMESPACE_CORE = 0;
const AWD2_STREAM_INDICES = 2;
const AWD2_STREAM_NORMALS = 4;
const AWD2_STREAM_POSITIONS = 1;
const AWD2_STREAM_TANGENTS = 5;
const AWD2_STREAM_UVS = 3;

const positions = new Float32Array([
  // front
  -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
  // back
  1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, -1,
  // right
  1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1,
  // left
  -1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1,
  // top
  -1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1,
  // bottom
  -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1,
]);

const normals = new Float32Array([
  0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0,
  0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
]);

const tangents = new Float32Array([
  1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
  0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
]);

const uvs = new Float32Array([
  0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0,
  0, 0, 1, 1, 1, 1, 0, 0, 0,
]);

const indices = new Uint16Array([
  0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22,
  20, 22, 23,
]);

const identityTransform = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

export function createSyntheticAwd2(): Uint8Array {
  const geometry = buildGeometryBody('Authored cube', [
    buildStream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, positions),
    buildStream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, indices),
    buildStream(AWD2_STREAM_NORMALS, AWD2_DATA_FLOAT32, normals),
    buildStream(AWD2_STREAM_UVS, AWD2_DATA_FLOAT32, uvs),
    buildStream(AWD2_STREAM_TANGENTS, AWD2_DATA_FLOAT32, tangents),
  ]);
  const material = buildMaterialBody('Cerulean');
  const mesh = buildMeshBody('AWD2 cube', 1, 2);
  const body = concatBytes(
    buildBlockHeader(1, AWD2_BLOCK_TRIANGLE_GEOMETRY, geometry.length),
    geometry,
    buildBlockHeader(2, AWD2_BLOCK_MATERIAL, material.length),
    material,
    buildBlockHeader(3, AWD2_BLOCK_MESH_INSTANCE, mesh.length),
    mesh,
  );
  return concatBytes(buildFileHeader(body.length), body);
}

function buildFileHeader(bodyLength: number): Uint8Array {
  const result = new Uint8Array(12);
  const view = new DataView(result.buffer);
  result.set([0x41, 0x57, 0x44, 2, 1]);
  view.setUint16(5, 0, true);
  result[7] = 0;
  view.setUint32(8, bodyLength, true);
  return result;
}

function buildBlockHeader(blockId: number, blockType: number, blockLength: number): Uint8Array {
  const result = new Uint8Array(11);
  const view = new DataView(result.buffer);
  view.setUint32(0, blockId, true);
  result[4] = AWD2_NAMESPACE_CORE;
  result[5] = blockType;
  result[6] = 0;
  view.setUint32(7, blockLength, true);
  return result;
}

function buildGeometryBody(name: string, streams: readonly Uint8Array[]): Uint8Array {
  const streamLength = streams.reduce((total, stream) => total + stream.length, 0);
  const subMeshLength = 4 + streamLength + 4;
  const subMeshHeader = new Uint8Array(4);
  new DataView(subMeshHeader.buffer).setUint32(0, subMeshLength, true);
  const subMeshCount = new Uint8Array(2);
  new DataView(subMeshCount.buffer).setUint16(0, 1, true);
  return concatBytes(
    buildString(name),
    subMeshCount,
    buildEmptyAttributeList(),
    subMeshHeader,
    buildEmptyAttributeList(),
    ...streams,
    buildEmptyAttributeList(),
  );
}

function buildStream(streamType: number, dataType: number, data: ArrayBufferView): Uint8Array {
  const result = new Uint8Array(6 + data.byteLength);
  const view = new DataView(result.buffer);
  result[0] = streamType;
  result[1] = dataType;
  view.setUint32(2, data.byteLength, true);
  result.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), 6);
  return result;
}

function buildMaterialBody(name: string): Uint8Array {
  const property = new Uint8Array(14);
  const view = new DataView(property.buffer);
  view.setUint32(0, 10, true);
  view.setUint16(4, AWD2_MATERIAL_PROP_COLOR, true);
  view.setUint32(6, 4, true);
  view.setUint32(10, 0x218bc5, true);
  return concatBytes(
    buildString(name),
    new Uint8Array([AWD2_MATERIAL_TYPE_COLOR, 0]),
    property,
    buildEmptyAttributeList(),
  );
}

function buildMeshBody(name: string, geometryId: number, materialId: number): Uint8Array {
  const sceneHeader = new Uint8Array(4 + 12 * 4);
  const view = new DataView(sceneHeader.buffer);
  view.setUint32(0, 0, true);
  for (let i = 0; i < identityTransform.length; i++) view.setFloat32(4 + i * 4, identityTransform[i], true);
  const references = new Uint8Array(10);
  const referenceView = new DataView(references.buffer);
  referenceView.setUint32(0, geometryId, true);
  referenceView.setUint16(4, 1, true);
  referenceView.setUint32(6, materialId, true);
  return concatBytes(sceneHeader, buildString(name), references, buildEmptyAttributeList(), buildEmptyAttributeList());
}

function buildString(value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  const result = new Uint8Array(2 + encoded.length);
  new DataView(result.buffer).setUint16(0, encoded.length, true);
  result.set(encoded, 2);
  return result;
}

function buildEmptyAttributeList(): Uint8Array {
  return new Uint8Array(4);
}

function concatBytes(...arrays: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(arrays.reduce((total, array) => total + array.length, 0));
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}
