import {
  composeMatrix4FromTransform3D,
  createMatrix4,
  createVector3,
  inverseMatrix4,
  matrix4TransformPoint,
  matrix4TransformVector,
  rotateVector3ByQuaternion,
  transposeMatrix4,
} from '@flighthq/geometry/contract';
import {
  getMeshGeometryIndexCount,
  getMeshGeometryTriangleVertexIndices,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh/contract';
import { getNodeChildren } from '@flighthq/node/contract';
import { isMesh } from '@flighthq/scene3d/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type {
  BlinnPhongMaterial,
  ExternalImageResourceReference,
  ImportDiagnostic,
  Mesh,
  MeshGeometry,
  Node3D,
  PointLight,
  Quaternion,
  SpotLight,
  Vector3,
} from '@flighthq/types/contract';
import { BlinnPhongMaterialKind, ImportDiagnosticSeverity } from '@flighthq/types/contract';
import {
  THREE_DS_CAMERA,
  THREE_DS_CAMERA_APERTURE_MM,
  THREE_DS_CAMERA_RANGES,
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_COLOR_BYTE,
  THREE_DS_COLOR_FLOAT,
  THREE_DS_EDITOR,
  THREE_DS_LIGHT,
  THREE_DS_LIGHT_INNER_RANGE,
  THREE_DS_LIGHT_MULTIPLIER,
  THREE_DS_LIGHT_OFF,
  THREE_DS_LIGHT_OUTER_RANGE,
  THREE_DS_LIGHT_SPOT,
  THREE_DS_FACE_MATERIAL,
  THREE_DS_FACES,
  THREE_DS_MAIN,
  THREE_DS_MATERIAL,
  THREE_DS_MATERIAL_BUMP_MAP,
  THREE_DS_MATERIAL_DIFFUSE,
  THREE_DS_KEYFRAME,
  THREE_DS_KEYFRAME_NODE_HEADER,
  THREE_DS_KEYFRAME_OBJECT_NODE,
  THREE_DS_KEYFRAME_PIVOT,
  THREE_DS_MATERIAL_NAME,
  THREE_DS_MATERIAL_OPACITY_MAP,
  THREE_DS_MATERIAL_SHININESS,
  THREE_DS_MATERIAL_SPECULAR,
  THREE_DS_MATERIAL_TEXTURE_FILENAME,
  THREE_DS_MATERIAL_TEXTURE_MAP,
  THREE_DS_MATERIAL_TRANSPARENCY,
  THREE_DS_OBJECT,
  THREE_DS_PERCENT_INT,
  THREE_DS_SMOOTH_GROUP,
  THREE_DS_TRANSFORM_MATRIX,
  THREE_DS_TRIMESH,
  THREE_DS_UV_COORDS,
  THREE_DS_VERTICES,
} from '@flighthq/types/contract';

import { getTestTextureResource } from './scene3DFormatsTestHelper';
import { convertPositionsZUpToYUp } from './shared';
import { createScene3DFrom3ds, parse3ds } from './threeDsParse';

// Builds a minimal valid 3DS binary from helper functions. The 3DS format is a recursive chunk tree:
// each chunk has a uint16 ID + uint32 length (including the 6-byte header) + payload.

function writeChunk(id: number, payload: Uint8Array): Uint8Array {
  const total = THREE_DS_CHUNK_HEADER_BYTES + payload.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, id, true);
  view.setUint32(2, total, true);
  out.set(payload, THREE_DS_CHUNK_HEADER_BYTES);
  return out;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (let i = 0; i < arrays.length; i++) totalLength += arrays[i].byteLength;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < arrays.length; i++) {
    result.set(arrays[i], offset);
    offset += arrays[i].byteLength;
  }
  return result;
}

function writeNullTerminatedString(s: string): Uint8Array {
  const out = new Uint8Array(s.length + 1);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  out[s.length] = 0;
  return out;
}

// Builds a vertex sub-chunk (0x4110): uint16 count + count * 3 * float32 (x, y, z in Z-up).
function writeVertices(positions: readonly number[]): Uint8Array {
  const count = positions.length / 3;
  const payload = new Uint8Array(2 + count * 3 * 4);
  const view = new DataView(payload.buffer);
  view.setUint16(0, count, true);
  let offset = 2;
  for (let i = 0; i < positions.length; i++) {
    view.setFloat32(offset, positions[i], true);
    offset += 4;
  }
  return writeChunk(THREE_DS_VERTICES, payload);
}

// Builds a face sub-chunk (0x4120): uint16 count + count * 4 * uint16 (v0, v1, v2, flags).
function writeFaces(indices: readonly number[]): Uint8Array {
  const count = indices.length / 3;
  const payload = new Uint8Array(2 + count * 4 * 2);
  const view = new DataView(payload.buffer);
  view.setUint16(0, count, true);
  let offset = 2;
  for (let i = 0; i < count; i++) {
    view.setUint16(offset, indices[i * 3], true);
    view.setUint16(offset + 2, indices[i * 3 + 1], true);
    view.setUint16(offset + 4, indices[i * 3 + 2], true);
    view.setUint16(offset + 6, 0, true); // flags
    offset += 8;
  }
  return writeChunk(THREE_DS_FACES, payload);
}

// Builds a UV sub-chunk (0x4140): uint16 count + count * 2 * float32 (u, v).
function writeUvCoords(uvs: readonly number[]): Uint8Array {
  const count = uvs.length / 2;
  const payload = new Uint8Array(2 + count * 2 * 4);
  const view = new DataView(payload.buffer);
  view.setUint16(0, count, true);
  let offset = 2;
  for (let i = 0; i < uvs.length; i++) {
    view.setFloat32(offset, uvs[i], true);
    offset += 4;
  }
  return writeChunk(THREE_DS_UV_COORDS, payload);
}

// Builds a float32 payload chunk — the shape every scalar light sub-chunk (multiplier, ranges) uses.
function writeFloatChunk(id: number, value: number): Uint8Array {
  const payload = new Uint8Array(4);
  new DataView(payload.buffer).setFloat32(0, value, true);
  return writeChunk(id, payload);
}

// Builds a light object (0x4000 wrapping 0x4600): the name, then the light's Z-up position, then the
// sub-chunks the caller asked for. Passing `target` adds the spot sub-chunk (0x4610), which is what
// makes the light a spot rather than a point.
function writeLightObject(options: {
  color?: readonly [number, number, number];
  hotspot?: number;
  falloff?: number;
  innerRange?: number;
  multiplier?: number;
  name: string;
  off?: boolean;
  outerRange?: number;
  position: readonly [number, number, number];
  target?: readonly [number, number, number];
}): Uint8Array {
  const position = new Uint8Array(12);
  const positionView = new DataView(position.buffer);
  positionView.setFloat32(0, options.position[0], true);
  positionView.setFloat32(4, options.position[1], true);
  positionView.setFloat32(8, options.position[2], true);

  const parts: Uint8Array[] = [position];
  if (options.color !== undefined) {
    const color = new Uint8Array(12);
    const colorView = new DataView(color.buffer);
    colorView.setFloat32(0, options.color[0], true);
    colorView.setFloat32(4, options.color[1], true);
    colorView.setFloat32(8, options.color[2], true);
    parts.push(writeChunk(THREE_DS_COLOR_FLOAT, color));
  }
  if (options.multiplier !== undefined) parts.push(writeFloatChunk(THREE_DS_LIGHT_MULTIPLIER, options.multiplier));
  if (options.innerRange !== undefined) parts.push(writeFloatChunk(THREE_DS_LIGHT_INNER_RANGE, options.innerRange));
  if (options.outerRange !== undefined) parts.push(writeFloatChunk(THREE_DS_LIGHT_OUTER_RANGE, options.outerRange));
  if (options.off === true) parts.push(writeChunk(THREE_DS_LIGHT_OFF, new Uint8Array(0)));
  if (options.target !== undefined) {
    const spot = new Uint8Array(20);
    const spotView = new DataView(spot.buffer);
    spotView.setFloat32(0, options.target[0], true);
    spotView.setFloat32(4, options.target[1], true);
    spotView.setFloat32(8, options.target[2], true);
    spotView.setFloat32(12, options.hotspot ?? 0, true);
    spotView.setFloat32(16, options.falloff ?? 0, true);
    parts.push(writeChunk(THREE_DS_LIGHT_SPOT, spot));
  }

  const light = writeChunk(THREE_DS_LIGHT, concatBytes(...parts));
  return writeChunk(THREE_DS_OBJECT, concatBytes(writeNullTerminatedString(options.name), light));
}

// Builds a camera object (0x4000 wrapping 0x4700): the name, then the fixed 32-byte record — Z-up
// position, Z-up aim target, bank angle in degrees, lens focal length in millimetres — then an optional
// CAM_RANGES sub-chunk.
function writeCameraObject(options: {
  far?: number;
  focalLength: number;
  name: string;
  near?: number;
  position: readonly [number, number, number];
  roll?: number;
  target: readonly [number, number, number];
}): Uint8Array {
  const record = new Uint8Array(32);
  const view = new DataView(record.buffer);
  view.setFloat32(0, options.position[0], true);
  view.setFloat32(4, options.position[1], true);
  view.setFloat32(8, options.position[2], true);
  view.setFloat32(12, options.target[0], true);
  view.setFloat32(16, options.target[1], true);
  view.setFloat32(20, options.target[2], true);
  view.setFloat32(24, options.roll ?? 0, true);
  view.setFloat32(28, options.focalLength, true);

  const parts: Uint8Array[] = [record];
  if (options.near !== undefined && options.far !== undefined) {
    const ranges = new Uint8Array(8);
    const rangesView = new DataView(ranges.buffer);
    rangesView.setFloat32(0, options.near, true);
    rangesView.setFloat32(4, options.far, true);
    parts.push(writeChunk(THREE_DS_CAMERA_RANGES, ranges));
  }

  const camera = writeChunk(THREE_DS_CAMERA, concatBytes(...parts));
  return writeChunk(THREE_DS_OBJECT, concatBytes(writeNullTerminatedString(options.name), camera));
}

// Wraps already-built object chunks in the editor and main chunks to make a complete 3DS file.
function buildObjects3ds(...objects: Uint8Array[]): Uint8Array {
  return writeChunk(THREE_DS_MAIN, writeChunk(THREE_DS_EDITOR, concatBytes(...objects)));
}

// Builds a complete 3DS file with one or more meshes.
function buildTriangle3ds(
  name: string,
  positions: readonly number[],
  indices: readonly number[],
  uvs?: readonly number[],
): Uint8Array {
  const trimeshPayload =
    uvs !== undefined
      ? concatBytes(writeVertices(positions), writeFaces(indices), writeUvCoords(uvs))
      : concatBytes(writeVertices(positions), writeFaces(indices));

  const trimesh = writeChunk(THREE_DS_TRIMESH, trimeshPayload);
  const objectPayload = concatBytes(writeNullTerminatedString(name), trimesh);
  const object = writeChunk(THREE_DS_OBJECT, objectPayload);
  const editor = writeChunk(THREE_DS_EDITOR, object);
  return writeChunk(THREE_DS_MAIN, editor);
}

function buildMultiMesh3ds(
  meshes: readonly { indices: readonly number[]; name: string; positions: readonly number[] }[],
): Uint8Array {
  const objects: Uint8Array[] = [];
  for (let i = 0; i < meshes.length; i++) {
    const m = meshes[i];
    const trimeshPayload = concatBytes(writeVertices(m.positions), writeFaces(m.indices));
    const trimesh = writeChunk(THREE_DS_TRIMESH, trimeshPayload);
    const objectPayload = concatBytes(writeNullTerminatedString(m.name), trimesh);
    objects.push(writeChunk(THREE_DS_OBJECT, objectPayload));
  }
  const editor = writeChunk(THREE_DS_EDITOR, concatBytes(...objects));
  return writeChunk(THREE_DS_MAIN, editor);
}

// Builds a COLOR_BYTE color sub-chunk (0x0011): 3 uint8 channels.
function writeColorByte(r: number, g: number, b: number): Uint8Array {
  return writeChunk(THREE_DS_COLOR_BYTE, new Uint8Array([r, g, b]));
}

// Builds a COLOR_FLOAT color sub-chunk (0x0010): 3 float32 channels in [0,1].
function writeColorFloat(r: number, g: number, b: number): Uint8Array {
  const payload = new Uint8Array(12);
  const view = new DataView(payload.buffer);
  view.setFloat32(0, r, true);
  view.setFloat32(4, g, true);
  view.setFloat32(8, b, true);
  return writeChunk(THREE_DS_COLOR_FLOAT, payload);
}

// Builds an INT_PERCENTAGE sub-chunk (0x0030): a uint16 in [0,100].
function writePercentInt(percent: number): Uint8Array {
  const payload = new Uint8Array(2);
  new DataView(payload.buffer).setUint16(0, percent, true);
  return writeChunk(THREE_DS_PERCENT_INT, payload);
}

// Builds a material block (0xAFFF) with a name, diffuse/specular colors, and optional texture/shininess/
// transparency/bump sub-chunks. `diffuseFloat` writes the diffuse color via COLOR_FLOAT instead of COLOR_BYTE.
function writeMaterial(opts: {
  bumpFilename?: string;
  diffuse: readonly [number, number, number];
  diffuseFloat?: boolean;
  name: string;
  opacityFilename?: string;
  shininessPercent?: number;
  specular?: readonly [number, number, number];
  textureFilename?: string;
  transparencyPercent?: number;
}): Uint8Array {
  const diffuseColor = opts.diffuseFloat ? writeColorFloat(...opts.diffuse) : writeColorByte(...opts.diffuse);
  const parts: Uint8Array[] = [
    writeChunk(THREE_DS_MATERIAL_NAME, writeNullTerminatedString(opts.name)),
    writeChunk(THREE_DS_MATERIAL_DIFFUSE, diffuseColor),
  ];
  if (opts.specular !== undefined) parts.push(writeChunk(THREE_DS_MATERIAL_SPECULAR, writeColorByte(...opts.specular)));
  if (opts.shininessPercent !== undefined) {
    parts.push(writeChunk(THREE_DS_MATERIAL_SHININESS, writePercentInt(opts.shininessPercent)));
  }
  if (opts.transparencyPercent !== undefined) {
    parts.push(writeChunk(THREE_DS_MATERIAL_TRANSPARENCY, writePercentInt(opts.transparencyPercent)));
  }
  if (opts.textureFilename !== undefined) {
    const filename = writeChunk(THREE_DS_MATERIAL_TEXTURE_FILENAME, writeNullTerminatedString(opts.textureFilename));
    parts.push(writeChunk(THREE_DS_MATERIAL_TEXTURE_MAP, filename));
  }
  if (opts.bumpFilename !== undefined) {
    const filename = writeChunk(THREE_DS_MATERIAL_TEXTURE_FILENAME, writeNullTerminatedString(opts.bumpFilename));
    parts.push(writeChunk(THREE_DS_MATERIAL_BUMP_MAP, filename));
  }
  if (opts.opacityFilename !== undefined) {
    const filename = writeChunk(THREE_DS_MATERIAL_TEXTURE_FILENAME, writeNullTerminatedString(opts.opacityFilename));
    parts.push(writeChunk(THREE_DS_MATERIAL_OPACITY_MAP, filename));
  }
  return writeChunk(THREE_DS_MATERIAL, concatBytes(...parts));
}

// Builds a face sub-chunk (0x4120) whose face array is followed by a FACE_MATERIAL sub-chunk (0x4130)
// naming the material every face uses.
function writeFacesWithMaterial(indices: readonly number[], materialName: string): Uint8Array {
  const count = indices.length / 3;
  const faceArray = new Uint8Array(2 + count * 4 * 2);
  const faceView = new DataView(faceArray.buffer);
  faceView.setUint16(0, count, true);
  for (let i = 0; i < count; i++) {
    const o = 2 + i * 8;
    faceView.setUint16(o, indices[i * 3], true);
    faceView.setUint16(o + 2, indices[i * 3 + 1], true);
    faceView.setUint16(o + 4, indices[i * 3 + 2], true);
    faceView.setUint16(o + 6, 0, true); // flags
  }
  const faceRefs = new Uint8Array(2 + count * 2);
  const refView = new DataView(faceRefs.buffer);
  refView.setUint16(0, count, true);
  for (let i = 0; i < count; i++) refView.setUint16(2 + i * 2, i, true);
  const faceMaterial = writeChunk(
    THREE_DS_FACE_MATERIAL,
    concatBytes(writeNullTerminatedString(materialName), faceRefs),
  );
  return writeChunk(THREE_DS_FACES, concatBytes(faceArray, faceMaterial));
}

// Builds a face sub-chunk (0x4120) followed by any number of FACE_MATERIAL (0x4130) groups and an
// optional SMOOTH_GROUP (0x4150) per-face bitmask list — the general form the subset/smoothing tests use.
function writeFacesWithGroups(
  indices: readonly number[],
  opts: { groups?: readonly { faces: readonly number[]; name: string }[]; smoothing?: readonly number[] } = {},
): Uint8Array {
  const count = indices.length / 3;
  const faceArray = new Uint8Array(2 + count * 4 * 2);
  const faceView = new DataView(faceArray.buffer);
  faceView.setUint16(0, count, true);
  for (let i = 0; i < count; i++) {
    const o = 2 + i * 8;
    faceView.setUint16(o, indices[i * 3], true);
    faceView.setUint16(o + 2, indices[i * 3 + 1], true);
    faceView.setUint16(o + 4, indices[i * 3 + 2], true);
    faceView.setUint16(o + 6, 0, true); // flags
  }
  const parts: Uint8Array[] = [faceArray];
  for (const group of opts.groups ?? []) {
    const refs = new Uint8Array(2 + group.faces.length * 2);
    const refView = new DataView(refs.buffer);
    refView.setUint16(0, group.faces.length, true);
    group.faces.forEach((f, i) => refView.setUint16(2 + i * 2, f, true));
    parts.push(writeChunk(THREE_DS_FACE_MATERIAL, concatBytes(writeNullTerminatedString(group.name), refs)));
  }
  if (opts.smoothing !== undefined) {
    const masks = new Uint8Array(opts.smoothing.length * 4);
    const maskView = new DataView(masks.buffer);
    opts.smoothing.forEach((m, i) => maskView.setUint32(i * 4, m >>> 0, true));
    parts.push(writeChunk(THREE_DS_SMOOTH_GROUP, masks));
  }
  return writeChunk(THREE_DS_FACES, concatBytes(...parts));
}

// Wraps a vertex list + a prebuilt faces chunk and any material chunks into a full one-object 3DS file.
function buildScene3D3ds(opts: {
  facesChunk: Uint8Array;
  materials?: readonly Uint8Array[];
  meshName: string;
  positions: readonly number[];
}): Uint8Array {
  const trimesh = writeChunk(THREE_DS_TRIMESH, concatBytes(writeVertices(opts.positions), opts.facesChunk));
  const object = writeChunk(THREE_DS_OBJECT, concatBytes(writeNullTerminatedString(opts.meshName), trimesh));
  const editor = writeChunk(THREE_DS_EDITOR, concatBytes(...(opts.materials ?? []), object));
  return writeChunk(THREE_DS_MAIN, editor);
}

// Builds a 3DS file with one material and one mesh whose faces reference it by name.
function buildMaterialScene3D3ds(opts: {
  faceMaterialName: string;
  indices: readonly number[];
  material: Uint8Array;
  meshName: string;
  positions: readonly number[];
}): Uint8Array {
  const trimeshPayload = concatBytes(
    writeVertices(opts.positions),
    writeFacesWithMaterial(opts.indices, opts.faceMaterialName),
  );
  const trimesh = writeChunk(THREE_DS_TRIMESH, trimeshPayload);
  const object = writeChunk(THREE_DS_OBJECT, concatBytes(writeNullTerminatedString(opts.meshName), trimesh));
  const editor = writeChunk(THREE_DS_EDITOR, concatBytes(opts.material, object));
  return writeChunk(THREE_DS_MAIN, editor);
}

function findDiagnostic(diagnostics: readonly ImportDiagnostic[], kind: string): ImportDiagnostic | undefined {
  return diagnostics.find((diagnostic) => diagnostic.kind === kind);
}

// Wraps a raw trimesh payload (any sub-chunks) into a full one-object 3DS file so parse3ds reaches it.
function wrapTrimesh(name: string, trimeshPayload: Uint8Array): Uint8Array {
  const trimesh = writeChunk(THREE_DS_TRIMESH, trimeshPayload);
  const object = writeChunk(THREE_DS_OBJECT, concatBytes(writeNullTerminatedString(name), trimesh));
  const editor = writeChunk(THREE_DS_EDITOR, object);
  return writeChunk(THREE_DS_MAIN, editor);
}

// A VERTICES sub-chunk whose declared count does not match the payload — for truncation coverage.
function rawVerticesChunk(declaredCount: number, floats: readonly number[]): Uint8Array {
  const payload = new Uint8Array(2 + floats.length * 4);
  const view = new DataView(payload.buffer);
  view.setUint16(0, declaredCount, true);
  floats.forEach((f, i) => view.setFloat32(2 + i * 4, f, true));
  return writeChunk(THREE_DS_VERTICES, payload);
}

// A FACES sub-chunk whose declared count does not match the payload — for truncation coverage.
function rawFacesChunk(declaredCount: number, indexBytes: number): Uint8Array {
  const payload = new Uint8Array(2 + indexBytes);
  new DataView(payload.buffer).setUint16(0, declaredCount, true);
  return writeChunk(THREE_DS_FACES, payload);
}

// A UV_COORDS sub-chunk whose declared count does not match the payload — for truncation coverage.
function rawUvChunk(declaredCount: number, floats: readonly number[]): Uint8Array {
  const payload = new Uint8Array(2 + floats.length * 4);
  const view = new DataView(payload.buffer);
  view.setUint16(0, declaredCount, true);
  floats.forEach((f, i) => view.setFloat32(2 + i * 4, f, true));
  return writeChunk(THREE_DS_UV_COORDS, payload);
}

// Overwrites a chunk's uint32 length field (at offset+2) in place — for boundary-exceed coverage.
function tamperChunkLength(chunk: Uint8Array, newLength: number): Uint8Array {
  const copy = chunk.slice();
  new DataView(copy.buffer).setUint32(2, newLength, true);
  return copy;
}

// A closed mesh's signed volume, Σ v0·(v1×v2)/6 over its triangles, computed from POSITIONS AND INDICES
// ALONE. That independence is the point: 3DS carries no authored normals — its normals are derived from
// the same edge cross product a winding check would use — so comparing winding against them would compare
// a quantity with itself and pass by construction. Signed volume shares no term with the normal pass, so
// it can disagree.
//
// Positive iff the winding is consistently outward. Translation-invariant on a closed mesh, and preserved
// by a determinant-+1 rotation, so the Z-up→Y-up conversion cannot change its sign.
//
// `null` means INCONCLUSIVE, not "fine": the identity only holds for a closed surface, so an open mesh has
// no signed volume to speak of. Returning 0 or a positive number there would be a check that reads as
// coverage while measuring nothing.
function signedVolumeOfClosedGeometry(geometry: Readonly<MeshGeometry>): number | null {
  const indices = Array.from(geometry.indices!);
  // Closedness first: every directed edge exactly once, and its reverse present. That is what makes the
  // mesh a boundary of a solid rather than a sheet.
  const directed = new Map<string, number>();
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const t = [indices[i], indices[i + 1], indices[i + 2]];
    for (let j = 0; j < 3; j++) {
      const key = `${t[j]}>${t[(j + 1) % 3]}`;
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of directed) {
    if (count !== 1) return null;
    const [a, b] = key.split('>');
    if (!directed.has(`${b}>${a}`)) return null;
  }

  const p = { x: 0, y: 0, z: 0 };
  const read = (index: number) => {
    getMeshGeometryVertexPosition(p, geometry, index);
    return [p.x, p.y, p.z] as const;
  };
  let volume = 0;
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = read(indices[i]);
    const b = read(indices[i + 1]);
    const c = read(indices[i + 2]);
    const cross = [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]];
    volume += (a[0] * cross[0] + a[1] * cross[1] + a[2] * cross[2]) / 6;
  }
  return volume;
}

// Unit cube, wound counter-clockwise as seen from OUTSIDE — the convention this test asserts the parser
// preserves. Verified as authored: signed volume +1, and closed (36 directed edges, each once, each with
// its reverse).
const CUBE_POSITIONS = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
const CUBE_INDICES_CCW_OUT = [
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
];

describe('3ds triangle winding', () => {
  it('preserves outward winding through the Z-up→Y-up rotation, by SIGNED VOLUME not by normals', () => {
    // The testable half of the chain. "The conversion is a rotation, so it preserves winding" is checkable
    // here and now; "3DS's native winding is CCW-front" is a claim about the FORMAT that no synthetic file
    // can establish, and is labelled unverified rather than assumed — see threeDsParse.ts.
    const scene = createScene3DFrom3ds(buildTriangle3ds('cube', CUBE_POSITIONS, CUBE_INDICES_CCW_OUT));
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    const volume = signedVolumeOfClosedGeometry(geometry);
    expect(volume).not.toBeNull();
    // The value, not just the sign: a unit cube encloses exactly 1. A wrong magnitude would mean the
    // conversion is not the rotation it claims to be (a scale or a shear would survive a sign-only check).
    expect(volume!).toBeCloseTo(1, 6);
  });

  it('FLIPS the sign when the same cube is wound inward, so the check can fail', () => {
    // Negative control on the property itself. Swapping v1/v2 on every triangle inverts orientation and
    // nothing else, so a check that could not tell them apart would be measuring nothing.
    const reversed = CUBE_INDICES_CCW_OUT.slice();
    for (let i = 0; i + 2 < reversed.length; i += 3) {
      const tmp = reversed[i + 1];
      reversed[i + 1] = reversed[i + 2];
      reversed[i + 2] = tmp;
    }
    const scene = createScene3DFrom3ds(buildTriangle3ds('cube', CUBE_POSITIONS, reversed));
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    expect(signedVolumeOfClosedGeometry(geometry)!).toBeCloseTo(-1, 6);
  });

  it('reports INCONCLUSIVE for an OPEN mesh rather than scoring it', () => {
    // The trap this exists to close: the signed-volume identity holds only for a closed surface. Without
    // the closedness gate an open mesh can total a positive number and read as a pass, which is the
    // tautology failure one door over — a check that is green while measuring nothing.
    const openFaces = CUBE_INDICES_CCW_OUT.slice(0, 30); // five faces of six: a box with a hole.
    const scene = createScene3DFrom3ds(buildTriangle3ds('open', CUBE_POSITIONS, openFaces));
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    expect(signedVolumeOfClosedGeometry(geometry)).toBeNull();
  });
});

describe('createScene3DFrom3ds', () => {
  it('decodes a material to BlinnPhong and attaches it to the mesh that references it by name', () => {
    const material = writeMaterial({
      diffuse: [204, 102, 51],
      name: 'Skin',
      specular: [255, 255, 255],
      textureFilename: 'skin.png',
    });
    const scene = createScene3DFrom3ds(
      buildMaterialScene3D3ds({
        faceMaterialName: 'Skin',
        indices: [0, 1, 2],
        material,
        meshName: 'Cube',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      }),
    );

    const mesh = getNodeChildren(scene.root)[0] as Mesh;
    expect(mesh.materials).toHaveLength(1);
    const mat = mesh.materials[0] as BlinnPhongMaterial;
    expect(mat.kind).toBe(BlinnPhongMaterialKind);
    expect(mat.diffuse).toBe(0xcc6633ff); // 204,102,51 → opaque
    expect(mat.specular).toBe(0xffffffff);
    expect(mat.name).toBe('Skin'); // 3DS material chunk name preserved as the authored identity
    // Texture filename is referenced, not decoded.
    expect((getTestTextureResource(scene.resources, mat.diffuseMap!) as ExternalImageResourceReference).uri).toBe(
      'skin.png',
    );
    expect(getTextureSource(mat.diffuseMap!)).toBeNull();
  });

  // Builds a one-material scene from a material chunk and returns that material as a BlinnPhongMaterial.
  const materialFrom3ds = (material: Uint8Array): BlinnPhongMaterial => {
    const scene = createScene3DFrom3ds(
      buildMaterialScene3D3ds({
        faceMaterialName: 'M',
        indices: [0, 1, 2],
        material,
        meshName: 'Cube',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      }),
    );
    return (getNodeChildren(scene.root)[0] as Mesh).materials[0] as BlinnPhongMaterial;
  };

  it('maps the shininess percentage to a Blinn-Phong specular exponent', () => {
    const mat = materialFrom3ds(writeMaterial({ diffuse: [128, 128, 128], name: 'M', shininessPercent: 50 }));
    expect(mat.shininess).toBeCloseTo(64); // 50% → 0.5 × 128
  });

  it('passes an explicit 0% shininess through rather than reverting to the material default', () => {
    // An explicit MAT_SHININESS of 0 is a valid matte value; it must survive as 0, not become the
    // createBlinnPhongMaterial default.
    const explicit = materialFrom3ds(writeMaterial({ diffuse: [128, 128, 128], name: 'M', shininessPercent: 0 }));
    expect(explicit.shininess).toBe(0);
    // An absent MAT_SHININESS leaves the material's default in place (non-zero).
    const absent = materialFrom3ds(writeMaterial({ diffuse: [128, 128, 128], name: 'M' }));
    expect(absent.shininess).not.toBe(0);
  });

  it('does not bind the legacy bump (height) map to normalMap', () => {
    // MAT_BUMPMAP is a grayscale height map, not a tangent-space normal map — it must not land in
    // normalMap (which shaders sample as RGB*2-1 normals). Parsed as metadata only.
    const mat = materialFrom3ds(writeMaterial({ bumpFilename: 'bump.png', diffuse: [128, 128, 128], name: 'M' }));
    expect(mat.normalMap).toBeNull();
  });

  it('folds transparency into the diffuse alpha and a blend alphaMode', () => {
    const mat = materialFrom3ds(writeMaterial({ diffuse: [255, 0, 0], name: 'M', transparencyPercent: 25 }));
    // 25% transparent → 0.75 opacity → alpha 0xBF; diffuse RGB unchanged.
    expect(mat.diffuse).toBe(0xff0000bf);
    expect(mat.alphaMode).toBe('blend');
  });

  it('leaves a fully-opaque material at alphaMode opaque', () => {
    const mat = materialFrom3ds(writeMaterial({ diffuse: [255, 0, 0], name: 'M' }));
    expect(mat.diffuse).toBe(0xff0000ff);
    expect(mat.alphaMode).not.toBe('blend');
  });

  it('reads a diffuse color from the COL_FLOAT sub-chunk', () => {
    const mat = materialFrom3ds(writeMaterial({ diffuse: [1, 0.4, 0.2], diffuseFloat: true, name: 'M' }));
    // 1, 0.4, 0.2 → 255, 102, 51 → 0xff6633ff
    expect(mat.diffuse).toBe(0xff6633ff);
  });

  it('leaves a mesh unmaterialed when it references no material', () => {
    const mesh = getNodeChildren(
      createScene3DFrom3ds(buildTriangle3ds('Tri', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2])).root,
    )[0] as Mesh;
    // A mesh with no FACE_MATERIAL group is one default subset with a null (default-material) binding.
    expect(mesh.materials).toEqual([null]);
  });

  it('splits a multi-material mesh into one MeshSubset per FACE_MATERIAL group', () => {
    const red = writeMaterial({ diffuse: [255, 0, 0], name: 'Red' });
    const blue = writeMaterial({ diffuse: [0, 0, 255], name: 'Blue' });
    // A quad (two triangles): face 0 → Red, face 1 → Blue.
    const facesChunk = writeFacesWithGroups([0, 1, 2, 0, 2, 3], {
      groups: [
        { faces: [0], name: 'Red' },
        { faces: [1], name: 'Blue' },
      ],
    });
    const scene = createScene3DFrom3ds(
      buildScene3D3ds({
        facesChunk,
        materials: [red, blue],
        meshName: 'Quad',
        positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
      }),
    );

    const mesh = getNodeChildren(scene.root)[0] as Mesh;
    // Two contiguous subsets, one per material, each covering its triangle's 3 indices.
    expect(mesh.geometry.subsets).toEqual([
      { indexCount: 3, indexOffset: 0 },
      { indexCount: 3, indexOffset: 3 },
    ]);
    expect(mesh.materials).toHaveLength(2);
    expect((mesh.materials[0] as BlinnPhongMaterial).name).toBe('Red');
    expect((mesh.materials[1] as BlinnPhongMaterial).name).toBe('Blue');
  });

  it('gives faces belonging to no material group a trailing default subset', () => {
    const red = writeMaterial({ diffuse: [255, 0, 0], name: 'Red' });
    // Face 0 → Red; face 1 is in no group.
    const facesChunk = writeFacesWithGroups([0, 1, 2, 0, 2, 3], { groups: [{ faces: [0], name: 'Red' }] });
    const scene = createScene3DFrom3ds(
      buildScene3D3ds({
        facesChunk,
        materials: [red],
        meshName: 'Quad',
        positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
      }),
    );

    const mesh = getNodeChildren(scene.root)[0] as Mesh;
    expect(mesh.geometry.subsets).toHaveLength(2);
    // The Red subset then the unassigned faces as a null-material default subset.
    expect((mesh.materials[0] as BlinnPhongMaterial).name).toBe('Red');
    expect(mesh.materials[1]).toBeNull();
  });

  it('splits shared vertices across smoothing groups so a crease stays hard', () => {
    // Two perpendicular triangles sharing edge v1–v2 (a 90° fold): face 0 in the z=0 plane, face 1 in x=1.
    const positions = [0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1];
    const indices = [0, 1, 2, 1, 3, 2];

    // Same smoothing group → the shared edge is smoothed, so v1/v2 stay merged: 4 output vertices.
    const smooth = createScene3DFrom3ds(
      buildScene3D3ds({
        facesChunk: writeFacesWithGroups(indices, { smoothing: [1, 1] }),
        meshName: 'Fold',
        positions,
      }),
    );
    expect(getMeshGeometryVertexCount((getNodeChildren(smooth.root)[0] as Mesh).geometry)).toBe(4);

    // Different smoothing groups → the shared edge is a hard crease, so v1/v2 split: 6 output vertices.
    const hard = createScene3DFrom3ds(
      buildScene3D3ds({
        facesChunk: writeFacesWithGroups(indices, { smoothing: [1, 2] }),
        meshName: 'Fold',
        positions,
      }),
    );
    const hardGeom = (getNodeChildren(hard.root)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(hardGeom)).toBe(6);

    // Flat shading: face 0's corner (vertex 0) and face 1's corner (vertex 3) carry their own, differing
    // face normals — the perpendicular faces do not blend into a rounded edge.
    const n0 = { x: 0, y: 0, z: 0 };
    const n3 = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexNormal(n0, hardGeom, 0);
    getMeshGeometryVertexNormal(n3, hardGeom, 3);
    expect([n0.x, n0.y, n0.z]).not.toEqual([n3.x, n3.y, n3.z]);
    expect(Math.hypot(n0.x, n0.y, n0.z)).toBeCloseTo(1);
  });

  it('smooths every shared vertex when the mesh carries no smoothing chunk', () => {
    // The same fold without a SMOOTH_GROUP chunk smooths across the crease (legacy behavior): 4 vertices.
    const positions = [0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1];
    const scene = createScene3DFrom3ds(
      buildScene3D3ds({ facesChunk: writeFacesWithGroups([0, 1, 2, 1, 3, 2]), meshName: 'Fold', positions }),
    );
    expect(getMeshGeometryVertexCount((getNodeChildren(scene.root)[0] as Mesh).geometry)).toBe(4);
  });

  it('converts Z-up to Y-up coordinates', () => {
    // A triangle in 3DS Z-up: (0,0,0), (1,0,0), (0,0,1) → Y-up: (0,0,0), (1,0,0), (0,1,0)
    const bytes = buildTriangle3ds('Tri', [0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 2]);
    const scene = createScene3DFrom3ds(bytes);
    const children = getNodeChildren(scene.root);
    expect(children).toHaveLength(1);

    // A named 3DS object is returned as a bare Mesh carrying the name, not a transform wrapper.
    const mesh = children[0] as Node3D;
    expect(isMesh(mesh)).toBe(true);
    expect(mesh.name).toBe('Tri');

    const geometry = (mesh as Mesh).geometry;
    const p = { x: 0, y: 0, z: 0 };

    getMeshGeometryVertexPosition(p, geometry, 0);
    expect([p.x, p.y, p.z]).toEqual([0, 0, 0]);

    getMeshGeometryVertexPosition(p, geometry, 1);
    expect([p.x, p.y, p.z]).toEqual([1, 0, 0]);

    // Z-up (0,0,1) → Y-up (0,1,0): the 3DS Z component becomes the Y component.
    getMeshGeometryVertexPosition(p, geometry, 2);
    expect([p.x, p.y, p.z]).toEqual([0, 1, 0]);
  });

  it('parses a single mesh with a triangle', () => {
    // 3DS Z-up vertices: (0,0,0), (1,0,0), (0,1,0) — note Y is the "forward" axis in Z-up.
    const bytes = buildTriangle3ds('Triangle', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
    const scene = createScene3DFrom3ds(bytes);
    const children = getNodeChildren(scene.root);
    expect(children).toHaveLength(1);

    const mesh = children[0] as Node3D;
    expect(isMesh(mesh)).toBe(true);
    expect(mesh.name).toBe('Triangle');

    const geometry = (mesh as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    expect(getMeshGeometryIndexCount(geometry)).toBe(3);
  });

  it('parses multiple meshes', () => {
    const bytes = buildMultiMesh3ds([
      { indices: [0, 1, 2], name: 'MeshA', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
      { indices: [0, 1, 2], name: 'MeshB', positions: [2, 0, 0, 3, 0, 0, 2, 1, 0] },
    ]);
    const scene = createScene3DFrom3ds(bytes);
    const children = getNodeChildren(scene.root);
    expect(children).toHaveLength(2);

    // Each named object is a bare Mesh child of the scene, carrying its name.
    expect(isMesh(children[0] as Node3D)).toBe(true);
    expect((children[0] as Node3D).name).toBe('MeshA');
    expect(isMesh(children[1] as Node3D)).toBe(true);
    expect((children[1] as Node3D).name).toBe('MeshB');
  });

  it('parses UV coordinates', () => {
    const bytes = buildTriangle3ds('UvTri', [0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 2], [0, 0, 1, 0, 0.5, 1]);
    const scene = createScene3DFrom3ds(bytes);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    const uv = { x: 0, y: 0 };
    getMeshGeometryVertexUv0(uv, geometry, 0);
    expect([uv.x, uv.y]).toEqual([0, 1]);
    getMeshGeometryVertexUv0(uv, geometry, 1);
    expect([uv.x, uv.y]).toEqual([1, 1]);
    getMeshGeometryVertexUv0(uv, geometry, 2);
    expect([uv.x, uv.y]).toEqual([0.5, 0]);
  });

  it('computes face normals facing outward, not inverted', () => {
    // A flat triangle wound CCW in the Z-up XY plane: its outward normal is +Z in Z-up, which
    // must become +Y after the -90°-about-X rotation. A reflection-based conversion would flip the
    // winding and produce -Y — the "holes into the model" / inverted-lighting symptom — so this
    // asserts the sign, not just the magnitude.
    const bytes = buildTriangle3ds('NormalTri', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
    const scene = createScene3DFrom3ds(bytes);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    const n = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexNormal(n, geometry, 0);
    expect(n.y).toBeGreaterThan(0.9);
    expect(Math.abs(n.x)).toBeLessThan(0.1);
    expect(Math.abs(n.z)).toBeLessThan(0.1);
  });

  it('converts Z-up to Y-up by rotation, not reflection', () => {
    // A vertex with a non-zero Y (forward) component distinguishes a rotation from a mirror: the
    // rotation (x, y, z) → (x, z, -y) negates the forward axis, whereas a Y↔Z swap would keep it
    // positive and mirror the model. Vertex (0, 1, 0) in 3DS Z-up must land at (0, 0, -1).
    const bytes = buildTriangle3ds('RotTri', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
    const scene = createScene3DFrom3ds(bytes);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    const p = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 2);
    expect([p.x, p.y, p.z]).toEqual([0, 0, -1]);
  });

  it('returns an empty scene for empty input', () => {
    const scene = createScene3DFrom3ds(new Uint8Array(0));
    expect(getNodeChildren(scene.root)).toHaveLength(0);
  });

  it('rejects and reports 3ds.input-too-small on empty input', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFrom3ds(new Uint8Array(0), diagnostics);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].kind).toBe('3ds.input-too-small');
    expect(diagnostics[0].severity).toBe(ImportDiagnosticSeverity.Reject);
    expect(diagnostics[0].origin).toBe('parse3ds');
  });

  it('rejects and reports 3ds.wrong-main-chunk on an invalid main chunk ID', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const bytes = new Uint8Array(6);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 0x1234, true);
    view.setUint32(2, 6, true);
    createScene3DFrom3ds(bytes, diagnostics);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].kind).toBe('3ds.wrong-main-chunk');
    expect(diagnostics[0].severity).toBe(ImportDiagnosticSeverity.Reject);
    expect(diagnostics[0].origin).toBe('parse3ds');
    expect(diagnostics[0].detail?.foundId).toBe(0x1234);
  });

  it('reports a diagnostic on truncated chunk data and returns a partial result', () => {
    const diagnostics: ImportDiagnostic[] = [];
    // Build a valid 3DS but truncate it.
    const full = buildTriangle3ds('Trunc', [0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 2]);
    // Cut off a significant portion of the end.
    const truncated = full.slice(0, Math.floor(full.byteLength * 0.5));
    createScene3DFrom3ds(truncated, diagnostics);
    expect(diagnostics.length).toBeGreaterThan(0);
    // Every crumb carries the top-level emitter origin and a count from its aggregation.
    for (const diagnostic of diagnostics) {
      expect(diagnostic.origin).toBe('parse3ds');
      expect(diagnostic.detail?.count).toBeGreaterThanOrEqual(1);
    }
  });

  it('drops and reports 3ds.mesh-missing-geometry for a mesh with no faces sub-chunk', () => {
    // Build a trimesh chunk with vertices but no faces sub-chunk.
    const trimeshPayload = writeVertices([0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const trimesh = writeChunk(THREE_DS_TRIMESH, trimeshPayload);
    const objectPayload = concatBytes(writeNullTerminatedString('NoFaces'), trimesh);
    const object = writeChunk(THREE_DS_OBJECT, objectPayload);
    const editor = writeChunk(THREE_DS_EDITOR, object);
    const bytes = writeChunk(THREE_DS_MAIN, editor);

    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFrom3ds(bytes, diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    const crumb = findDiagnostic(diagnostics, '3ds.mesh-missing-geometry');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.missing).toBe('faces');
    expect(crumb!.detail?.firstName).toBe('NoFaces');
  });
});

describe('createScene3DFrom3ds animations', () => {
  it('wraps the parsed scene with no animation and a one-element scenes array', () => {
    const bytes = buildTriangle3ds('Tri', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
    const scene = createScene3DFrom3ds(bytes);

    expect(Object.keys(scene.animations)).toHaveLength(0);
    expect(getNodeChildren(scene.root)).toHaveLength(1);
  });

  it('returns an empty import (no scene children) for non-3DS input', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFrom3ds(new Uint8Array([0, 0, 0, 0, 0, 0]), diagnostics);

    expect(Object.keys(scene.animations)).toHaveLength(0);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    expect(diagnostics.length).toBeGreaterThan(0);
  });
});

describe('parse3ds', () => {
  it('terminates on a zero-length chunk instead of spinning on a cursor that cannot advance', () => {
    // Every chunk walk advances by `cursor = chunkEnd`, so a declared length of 0 puts the end back at
    // the cursor and the loop never progresses — a HANG, not a throw: uncatchable, and it takes the
    // whole import with it. The trigger is not adversarial. Zero padding inside a parent whose declared
    // length still covers it lands the cursor on id 0x0000 / length 0x00000000, which is what an
    // exporter that block-aligns produces. Twelve bytes are enough to reproduce it.
    const bytes = new Uint8Array(12);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 0x4d4d, true); // MAIN
    view.setUint32(2, 12, true);
    view.setUint16(6, 0x4000, true); // OBJECT
    view.setUint32(8, 0, true); // length 0
    const document = parse3ds(bytes);
    expect(document.meshes).toHaveLength(0);
  });

  it('does not lose the rest of a parent to a chunk whose declared length is shorter than a header', () => {
    // The sibling of the hang: lengths 1-5 do advance, so they terminate, but they land the cursor
    // mid-header and every later chunk boundary in that parent is wrong. Both are one invariant —
    // a chunk shorter than its own header is not walkable — and both are closed by bounding the
    // advance where every walk derives it.
    const bytes = new Uint8Array(18);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 0x4d4d, true);
    view.setUint32(2, 18, true);
    view.setUint16(6, 0x4000, true);
    view.setUint32(8, 3, true); // shorter than the 6-byte header
    const document = parse3ds(bytes);
    expect(document.meshes).toHaveLength(0);
  });

  it('decomposes each trimesh into a document mesh node with inline geometry', () => {
    const document = parse3ds(buildTriangle3ds('Tri', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]));
    expect(document.meshes).toHaveLength(1);
    expect(getMeshGeometryVertexCount(document.meshes[0].geometry)).toBe(3);
    expect(document.nodes[0].mesh).toBe(0);
    expect(document.nodes[0].name).toBe('Tri');
    expect(document.scenes[0].rootNodes).toEqual([0]);
  });

  it('registers a referenced material into the document materials table by index', () => {
    const material = writeMaterial({
      diffuse: [204, 102, 51],
      name: 'Skin',
      specular: [255, 255, 255],
      textureFilename: 'skin.png',
    });
    const document = parse3ds(
      buildMaterialScene3D3ds({
        faceMaterialName: 'Skin',
        indices: [0, 1, 2],
        material,
        meshName: 'Cube',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      }),
    );
    expect(document.materials).toHaveLength(1);
    expect((document.materials[0] as BlinnPhongMaterial).name).toBe('Skin');
    expect(document.meshes[0].materials).toEqual([0]);
    expect(document.resources).toHaveLength(1);
    expect(getTestTextureResource(document.resources, (document.materials[0] as BlinnPhongMaterial).diffuseMap!)).toBe(
      document.resources[0],
    );
  });

  it('returns an empty document with a diagnostic for non-3DS input', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parse3ds(new Uint8Array([0, 0, 0, 0, 0, 0]), diagnostics);
    expect(document.nodes).toHaveLength(0);
    expect(diagnostics.length).toBeGreaterThan(0);
  });
});

describe('parse3ds diagnostics', () => {
  // ★ A CLEAN PARSE IS TWO CLAIMS: the values are right AND THE PARSER IS NOT COMPLAINING. Every other test
  // in this file checks the first. This checks the second, which is the one that goes unnoticed — a
  // diagnostic nothing asserts on is a silent failure again, and it is silent in precisely the cases it was
  // built for, because those are the cases nobody wrote a test for.
  //
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
    const diagnostics: ImportDiagnostic[] = [];

    parse3ds(buildTriangle3ds('Triangle', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]), diagnostics);

    const complaints = diagnostics.map((diagnostic) => diagnostic.kind);
    expect(complaints, `a good 3ds file made the parser complain: ${complaints.join(', ')}`).toEqual([]);
  });

  it('drops and reports 3ds.vertices-truncated (no-count) for a vertex chunk too small for its count', () => {
    const bytes = wrapTrimesh(
      'V',
      concatBytes(writeChunk(THREE_DS_VERTICES, new Uint8Array(1)), writeFaces([0, 1, 2])),
    );
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.vertices-truncated');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.reason).toBe('no-count');
  });

  it('drops and reports 3ds.vertices-truncated (truncated) with the declared count', () => {
    const bytes = wrapTrimesh('V', concatBytes(rawVerticesChunk(100, [0, 0, 0]), writeFaces([0, 1, 2])));
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.vertices-truncated');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.detail?.reason).toBe('truncated');
    expect(crumb!.detail?.firstCount).toBe(100);
  });

  it('drops and reports 3ds.faces-truncated (truncated) with the declared count', () => {
    const bytes = wrapTrimesh('F', concatBytes(writeVertices([0, 0, 0, 1, 0, 0, 0, 1, 0]), rawFacesChunk(100, 8)));
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.faces-truncated');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.firstCount).toBe(100);
  });

  it('recovers and reports 3ds.uv-truncated (truncated) for a UV chunk short of its count', () => {
    const bytes = wrapTrimesh(
      'U',
      concatBytes(writeVertices([0, 0, 0, 1, 0, 0, 0, 1, 0]), writeFaces([0, 1, 2]), rawUvChunk(100, [0, 0])),
    );
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.uv-truncated');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.detail?.firstCount).toBe(100);
  });

  it('drops and reports 3ds.face-index-out-of-range for a face referencing a missing vertex', () => {
    const bytes = buildTriangle3ds('OOR', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 5]);
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.face-index-out-of-range');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.firstDroppedFaces).toBe(1);
    expect(crumb!.detail?.firstVertexCount).toBe(3);
    expect(crumb!.detail?.firstName).toBe('OOR');
  });

  it('recovers and reports 3ds.material-group-face-out-of-range for a group face index past the mesh', () => {
    const bytes = buildScene3D3ds({
      facesChunk: writeFacesWithGroups([0, 1, 2], { groups: [{ faces: [0, 9], name: 'Red' }] }),
      materials: [writeMaterial({ diffuse: [255, 0, 0], name: 'Red' })],
      meshName: 'MG',
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    });
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.material-group-face-out-of-range');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.firstFaceCount).toBe(1);
    expect(crumb!.detail?.firstName).toBe('Red');
  });

  it('recovers and reports 3ds.smoothing-truncated for a mask list shorter than the face count', () => {
    const bytes = buildScene3D3ds({
      facesChunk: writeFacesWithGroups([0, 1, 2, 0, 2, 1], { smoothing: [1] }),
      meshName: 'SM',
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    });
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.smoothing-truncated');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.firstFaceCount).toBe(2);
  });

  it('drops and reports 3ds.material-group-truncated (no-count) for a group missing its face count', () => {
    // A FACE_MATERIAL sub-chunk carrying only a name, no uint16 count.
    const faceArray = new Uint8Array(2 + 1 * 4 * 2);
    new DataView(faceArray.buffer).setUint16(0, 1, true);
    const faceMaterial = writeChunk(THREE_DS_FACE_MATERIAL, writeNullTerminatedString('Red'));
    const facesChunk = writeChunk(THREE_DS_FACES, concatBytes(faceArray, faceMaterial));
    const bytes = buildScene3D3ds({
      facesChunk,
      materials: [writeMaterial({ diffuse: [255, 0, 0], name: 'Red' })],
      meshName: 'MGT',
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    });
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.material-group-truncated');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.reason).toBe('no-count');
    expect(crumb!.detail?.firstName).toBe('Red');
  });

  it('drops and reports 3ds.faces-truncated (no-count) for a face chunk too small to read its count', () => {
    const bytes = wrapTrimesh(
      'F',
      concatBytes(writeVertices([0, 0, 0, 1, 0, 0, 0, 1, 0]), writeChunk(THREE_DS_FACES, new Uint8Array(1))),
    );
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.faces-truncated');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.reason).toBe('no-count');
  });

  it('recovers and reports 3ds.uv-truncated (no-count) for a UV chunk too small to read its count', () => {
    const bytes = wrapTrimesh(
      'U',
      concatBytes(
        writeVertices([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        writeFaces([0, 1, 2]),
        writeChunk(THREE_DS_UV_COORDS, new Uint8Array(1)),
      ),
    );
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.uv-truncated');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.reason).toBe('no-count');
  });

  it('drops and reports 3ds.material-group-truncated (truncated) for a group short of its declared refs', () => {
    // A FACE_MATERIAL sub-chunk whose declared ref count (100) exceeds its actual ref payload.
    const faceArray = new Uint8Array(2 + 1 * 4 * 2);
    new DataView(faceArray.buffer).setUint16(0, 1, true);
    const refs = new Uint8Array(2 + 2); // declares 100 refs but only room for 1
    new DataView(refs.buffer).setUint16(0, 100, true);
    const faceMaterial = writeChunk(THREE_DS_FACE_MATERIAL, concatBytes(writeNullTerminatedString('Red'), refs));
    const facesChunk = writeChunk(THREE_DS_FACES, concatBytes(faceArray, faceMaterial));
    const bytes = buildScene3D3ds({
      facesChunk,
      materials: [writeMaterial({ diffuse: [255, 0, 0], name: 'Red' })],
      meshName: 'MGT',
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    });
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.material-group-truncated');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.reason).toBe('truncated');
    expect(crumb!.detail?.firstCount).toBe(100);
    expect(crumb!.detail?.firstName).toBe('Red');
  });

  it('drops and reports 3ds.mesh-missing-geometry (missing=vertices) for a trimesh with faces but no vertices', () => {
    const bytes = wrapTrimesh('NoVerts', writeFaces([0, 1, 2]));
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.mesh-missing-geometry');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.missing).toBe('vertices');
    expect(crumb!.detail?.firstName).toBe('NoVerts');
  });

  it('recovers and reports 3ds.chunk-exceeds-parent for a child chunk declaring length past its parent', () => {
    const object = writeChunk(
      THREE_DS_OBJECT,
      concatBytes(
        writeNullTerminatedString('X'),
        writeChunk(THREE_DS_TRIMESH, concatBytes(writeVertices([0, 0, 0, 1, 0, 0, 0, 1, 0]), writeFaces([0, 1, 2]))),
      ),
    );
    const editor = writeChunk(THREE_DS_EDITOR, tamperChunkLength(object, object.byteLength + 1000));
    const bytes = writeChunk(THREE_DS_MAIN, editor);
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.chunk-exceeds-parent');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.count).toBe(1);
  });

  it('recovers and reports 3ds.subchunk-exceeds-object for a sub-chunk declaring length past its object', () => {
    const trimesh = writeChunk(
      THREE_DS_TRIMESH,
      concatBytes(writeVertices([0, 0, 0, 1, 0, 0, 0, 1, 0]), writeFaces([0, 1, 2])),
    );
    const objectPayload = concatBytes(
      writeNullTerminatedString('X'),
      tamperChunkLength(trimesh, trimesh.byteLength + 1000),
    );
    const object = writeChunk(THREE_DS_OBJECT, objectPayload);
    const editor = writeChunk(THREE_DS_EDITOR, object);
    const bytes = writeChunk(THREE_DS_MAIN, editor);
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.subchunk-exceeds-object');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parse3ds');
  });

  it('recovers and reports 3ds.subchunk-exceeds-trimesh for a sub-chunk declaring length past its trimesh', () => {
    const vertices = writeVertices([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const trimeshPayload = concatBytes(tamperChunkLength(vertices, vertices.byteLength + 1000), writeFaces([0, 1, 2]));
    const bytes = wrapTrimesh('X', trimeshPayload);
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.subchunk-exceeds-trimesh');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.firstName).toBe('X');
  });

  it('aggregates repeated mesh-missing-geometry drops across meshes into one crumb with a count', () => {
    // Two objects, each a trimesh with vertices but no faces sub-chunk.
    const makeObject = (name: string): Uint8Array => {
      const trimesh = writeChunk(THREE_DS_TRIMESH, writeVertices([0, 0, 0, 1, 0, 0, 0, 1, 0]));
      return writeChunk(THREE_DS_OBJECT, concatBytes(writeNullTerminatedString(name), trimesh));
    };
    const editor = writeChunk(THREE_DS_EDITOR, concatBytes(makeObject('A'), makeObject('B')));
    const bytes = writeChunk(THREE_DS_MAIN, editor);
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const matching = diagnostics.filter((d) => d.kind === '3ds.mesh-missing-geometry');
    expect(matching).toHaveLength(1);
    expect(matching[0].detail?.count).toBe(2);
    expect(matching[0].detail?.firstName).toBe('A');
  });

  it('emits no diagnostics when no collector array is supplied', () => {
    const bytes = wrapTrimesh('X', concatBytes(rawVerticesChunk(100, [0, 0, 0]), rawFacesChunk(100, 8)));
    // Exercising the crumb paths without a sink must not throw and must be side-effect-free.
    expect(() => parse3ds(bytes)).not.toThrow();
  });

  it('drops and reports 3ds.mesh-empty for a parsed trimesh with zero vertices/faces', () => {
    const bytes = wrapTrimesh('Empty', concatBytes(writeVertices([]), writeFaces([])));
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFrom3ds(bytes, diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    const crumb = findDiagnostic(diagnostics, '3ds.mesh-empty');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.firstName).toBe('Empty');
  });

  it('drops and reports 3ds.material-missing for a FACE_MATERIAL group naming an unknown material', () => {
    const bytes = buildScene3D3ds({
      facesChunk: writeFacesWithGroups([0, 1, 2], { groups: [{ faces: [0], name: 'Ghost' }] }),
      meshName: 'MM',
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    });
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.material-missing');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.firstName).toBe('Ghost');
  });

  it('skips and reports 3ds.non-entity-object for a named object carrying no entity sub-chunk', () => {
    // An OBJECT chunk carrying only a name — a dummy/helper object, not a mesh, light, or camera.
    const object = writeChunk(THREE_DS_OBJECT, writeNullTerminatedString('Dummy01'));
    const editor = writeChunk(THREE_DS_EDITOR, object);
    const bytes = writeChunk(THREE_DS_MAIN, editor);
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFrom3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.non-entity-object');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.firstName).toBe('Dummy01');
  });

  it('recovers and reports 3ds.face-subchunk-exceeds for a face sub-chunk declaring length past the chunk', () => {
    // A FACE_MATERIAL sub-chunk header inside the FACES chunk whose declared length runs past the chunk end.
    const faceArray = new Uint8Array(2 + 1 * 4 * 2);
    new DataView(faceArray.buffer).setUint16(0, 1, true); // one face
    const badSub = new Uint8Array(THREE_DS_CHUNK_HEADER_BYTES);
    const badView = new DataView(badSub.buffer);
    badView.setUint16(0, THREE_DS_FACE_MATERIAL, true);
    badView.setUint32(2, 10000, true); // length far past the faces chunk
    const facesChunk = writeChunk(THREE_DS_FACES, concatBytes(faceArray, badSub));
    const bytes = buildScene3D3ds({ facesChunk, meshName: 'FS', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] });
    const diagnostics: ImportDiagnostic[] = [];
    parse3ds(bytes, diagnostics);
    const crumb = findDiagnostic(diagnostics, '3ds.face-subchunk-exceeds');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parse3ds');
  });
});

describe('parse3ds keyframer pivot', () => {
  function writeLocalMatrix(origin: readonly [number, number, number]): Uint8Array {
    const payload = new Uint8Array(48);
    const view = new DataView(payload.buffer);
    const all = [1, 0, 0, 0, 1, 0, 0, 0, 1, ...origin];
    for (let i = 0; i < 12; i++) view.setFloat32(i * 4, all[i], true);
    return writeChunk(THREE_DS_TRANSFORM_MATRIX, payload);
  }

  // KFDATA (0xB000) → object node tag (0xB002) → node header (0xB010, NUL-terminated name + two flag
  // uint16s + the hierarchy value) and pivot (0xB013, three float32).
  function writeKeyframer(name: string, pivot: readonly [number, number, number] | null): Uint8Array {
    const header = new Uint8Array(name.length + 1 + 6);
    for (let i = 0; i < name.length; i++) header[i] = name.charCodeAt(i);
    new DataView(header.buffer).setUint16(name.length + 1 + 4, 0xffff, true); // hierarchy — never read
    const parts: Uint8Array[] = [writeChunk(THREE_DS_KEYFRAME_NODE_HEADER, header)];
    if (pivot !== null) {
      const payload = new Uint8Array(12);
      const view = new DataView(payload.buffer);
      for (let i = 0; i < 3; i++) view.setFloat32(i * 4, pivot[i], true);
      parts.push(writeChunk(THREE_DS_KEYFRAME_PIVOT, payload));
    }
    const node = writeChunk(THREE_DS_KEYFRAME_OBJECT_NODE, concatBytes(...parts));
    return writeChunk(THREE_DS_KEYFRAME, node);
  }

  function buildPivot3ds(
    name: string,
    world: readonly number[],
    origin: readonly [number, number, number],
    pivot: readonly [number, number, number] | null,
  ): Uint8Array {
    const trimesh = writeChunk(
      THREE_DS_TRIMESH,
      concatBytes(writeVertices(world), writeFaces([0, 1, 2]), writeLocalMatrix(origin)),
    );
    const object = writeChunk(THREE_DS_OBJECT, concatBytes(writeNullTerminatedString(name), trimesh));
    // KFDATA is a SIBLING of the editor chunk, not a child of it.
    return writeChunk(THREE_DS_MAIN, concatBytes(writeChunk(THREE_DS_EDITOR, object), writeKeyframer(name, pivot)));
  }

  it('moves the pivot to the node origin without moving the geometry in the world', () => {
    // The same invariant TRI_LOCAL is held to: re-applying the emitted transform to the emitted geometry
    // must reproduce the file's world vertices. A pivot that shifted the render would fail here.
    const world = [10, 20, 30, 11, 20, 30, 10, 21, 30];
    const document = parse3ds(buildPivot3ds('Hinge', world, [10, 20, 30], [2, 3, 4]));
    const placement = createMatrix4();
    composeMatrix4FromTransform3D(placement, document.nodes[0].transform);

    const expected = Array.from(world);
    convertPositionsZUpToYUp(expected);

    const local = { x: 0, y: 0, z: 0 };
    const point = createVector3(0, 0, 0);
    for (let v = 0; v < 3; v++) {
      getMeshGeometryVertexPosition(local, document.meshes[0].geometry, v);
      point.x = local.x;
      point.y = local.y;
      point.z = local.z;
      matrix4TransformPoint(point, placement, point);
      expect(point.x).toBeCloseTo(expected[v * 3], 3);
      expect(point.y).toBeCloseTo(expected[v * 3 + 1], 3);
      expect(point.z).toBeCloseTo(expected[v * 3 + 2], 3);
    }
  });

  it('offsets the geometry by the pivot so the node rotates about the authored origin', () => {
    // Vertex 0 sits exactly at the object origin, so with a pivot of (2,3,4) it must land at -(2,3,4)
    // in model space — that displacement IS what makes a rotation swing about the hinge.
    const world = [10, 20, 30, 11, 20, 30, 10, 21, 30];
    const document = parse3ds(buildPivot3ds('Hinge', world, [10, 20, 30], [2, 3, 4]));

    const local = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(local, document.meshes[0].geometry, 0);
    // Z-up (-2, -3, -4) converts to Y-up (-2, -4, 3).
    expect(local.x).toBeCloseTo(-2, 4);
    expect(local.y).toBeCloseTo(-4, 4);
    expect(local.z).toBeCloseTo(3, 4);
  });

  it('leaves the geometry alone when the file states no keyframer', () => {
    const world = [10, 20, 30, 11, 20, 30, 10, 21, 30];
    const document = parse3ds(buildPivot3ds('Hinge', world, [10, 20, 30], null));

    const local = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(local, document.meshes[0].geometry, 0);
    expect(local.x).toBeCloseTo(0, 4);
    expect(local.y).toBeCloseTo(0, 4);
    expect(local.z).toBeCloseTo(0, 4);
  });

  it('ignores a keyframer pivot naming an object the editor chunk does not contain', () => {
    const world = [10, 20, 30, 11, 20, 30, 10, 21, 30];
    const trimesh = writeChunk(
      THREE_DS_TRIMESH,
      concatBytes(writeVertices(world), writeFaces([0, 1, 2]), writeLocalMatrix([10, 20, 30])),
    );
    const object = writeChunk(THREE_DS_OBJECT, concatBytes(writeNullTerminatedString('Real'), trimesh));
    const bytes = writeChunk(
      THREE_DS_MAIN,
      concatBytes(writeChunk(THREE_DS_EDITOR, object), writeKeyframer('Ghost', [5, 5, 5])),
    );
    const document = parse3ds(bytes);

    const local = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(local, document.meshes[0].geometry, 0);
    expect(local.x).toBeCloseTo(0, 4);
  });
});

describe('parse3ds lights and cameras', () => {
  // Rotating the canonical local forward axis by the emitted transform recovers the world-space aim, which
  // is the placement convention's own round trip (see Scene3DDocumentLight): the descriptor stays local and
  // the transform carries the orientation, so this is the only honest way to assert where a light points.
  function getAimedDirection(rotation: Readonly<Quaternion>): Vector3 {
    const out = createVector3(0, 0, -1);
    rotateVector3ByQuaternion(out, out, rotation);
    return out;
  }

  it('imports a light with no spot sub-chunk as a placed PointLight', () => {
    // Z-up (1, 2, 3) becomes Y-up (1, 3, -2) under the same rotation every mesh vertex takes.
    const document = parse3ds(
      buildObjects3ds(
        writeLightObject({ color: [1, 0.5, 0], multiplier: 2, name: 'Omni01', outerRange: 40, position: [1, 2, 3] }),
      ),
    );

    expect(document.lights).toHaveLength(1);
    const light = document.lights[0];
    expect(light.name).toBe('Omni01');
    expect(light.descriptor.kind).toBe('PointLight');
    expect((light.descriptor as PointLight).intensity).toBe(2);
    expect((light.descriptor as PointLight).range).toBe(40);
    expect(light.transform.position.x).toBeCloseTo(1, 5);
    expect(light.transform.position.y).toBeCloseTo(3, 5);
    expect(light.transform.position.z).toBeCloseTo(-2, 5);
    // The descriptor stays at the local origin — the transform is what places it.
    expect((light.descriptor as PointLight).position.x).toBe(0);
    expect((light.descriptor as PointLight).position.y).toBe(0);
    expect((light.descriptor as PointLight).position.z).toBe(0);
  });

  it('imports a light carrying the spot sub-chunk as a SpotLight aimed by its transform', () => {
    // Light at the Z-up origin aiming at Z-up (0, 0, -10): in Y-up that aim is straight down (0, -1, 0).
    const document = parse3ds(
      buildObjects3ds(
        writeLightObject({
          falloff: 60,
          hotspot: 30,
          name: 'Spot01',
          position: [0, 0, 0],
          target: [0, 0, -10],
        }),
      ),
    );

    expect(document.lights).toHaveLength(1);
    const light = document.lights[0];
    expect(light.descriptor.kind).toBe('SpotLight');

    const aim = getAimedDirection(light.transform.rotation);
    expect(aim.x).toBeCloseTo(0, 5);
    expect(aim.y).toBeCloseTo(-1, 5);
    expect(aim.z).toBeCloseTo(0, 5);

    // The descriptor's own direction stays the canonical local -Z; the transform supplies the aim.
    const spot = light.descriptor as SpotLight;
    expect(spot.direction.x).toBeCloseTo(0, 5);
    expect(spot.direction.y).toBeCloseTo(0, 5);
    expect(spot.direction.z).toBeCloseTo(-1, 5);

    // 3DS states FULL cone apertures; Flight stores the cosines of the HALF-angles.
    expect(spot.innerConeCos).toBeCloseTo(Math.cos(15 * (Math.PI / 180)), 5);
    expect(spot.outerConeCos).toBeCloseTo(Math.cos(30 * (Math.PI / 180)), 5);
    expect(spot.innerConeCos).toBeGreaterThan(spot.outerConeCos);
  });

  it('imports a light with no color or multiplier chunk at the format defaults', () => {
    const document = parse3ds(buildObjects3ds(writeLightObject({ name: 'Bare', position: [0, 0, 0] })));

    const light = document.lights[0].descriptor as PointLight;
    expect(light.color).toBe(0xffffffff);
    expect(light.intensity).toBe(1);
    // No OUTER_RANGE chunk means no cutoff — Flight's infinite-range sentinel, not a zero-radius light.
    expect(light.range).toBe(-1);
  });

  it('imports a switched-off light at zero intensity and reports 3ds.light-disabled', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parse3ds(
      buildObjects3ds(writeLightObject({ multiplier: 3, name: 'Off01', off: true, position: [5, 0, 0] })),
      diagnostics,
    );

    // The light is still imported, placement intact — only its intensity is zeroed.
    expect(document.lights).toHaveLength(1);
    expect((document.lights[0].descriptor as PointLight).intensity).toBe(0);
    expect(document.lights[0].transform.position.x).toBeCloseTo(5, 5);

    const crumb = findDiagnostic(diagnostics, '3ds.light-disabled');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(crumb!.origin).toBe('parse3ds');
    expect(crumb!.detail?.firstName).toBe('Off01');
  });

  it('skips and reports 3ds.light-inner-range-dropped for the attenuation start Flight does not model', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parse3ds(
      buildObjects3ds(writeLightObject({ innerRange: 10, name: 'Att', outerRange: 50, position: [0, 0, 0] })),
      diagnostics,
    );

    // The outer range still lands — only the start of the falloff has nowhere to go.
    expect((document.lights[0].descriptor as PointLight).range).toBe(50);
    const crumb = findDiagnostic(diagnostics, '3ds.light-inner-range-dropped');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(crumb!.detail?.firstName).toBe('Att');
  });

  it('imports a camera with its focal length converted to a field of view against the 35mm gate', () => {
    const document = parse3ds(
      buildObjects3ds(
        writeCameraObject({
          far: 500,
          focalLength: 50,
          name: 'Camera01',
          near: 2,
          position: [0, 0, 0],
          target: [0, 0, -10],
        }),
      ),
    );

    expect(document.cameras).toHaveLength(1);
    const camera = document.cameras[0];
    expect(camera.name).toBe('Camera01');
    expect(camera.near).toBe(2);
    expect(camera.far).toBe(500);
    expect(camera.projection.kind).toBe('perspective');
    expect(camera.projection).toMatchObject({ aspect: 1 });
    const fovY = 2 * Math.atan(THREE_DS_CAMERA_APERTURE_MM / (2 * 50));
    expect((camera.projection as { fovY: number }).fovY).toBeCloseTo(fovY, 6);

    const aim = getAimedDirection(camera.transform.rotation);
    expect(aim.y).toBeCloseTo(-1, 5);
  });

  it('falls back to the 3DS default clip range for a camera with no CAM_RANGES sub-chunk', () => {
    const document = parse3ds(
      buildObjects3ds(writeCameraObject({ focalLength: 50, name: 'NoRange', position: [0, 0, 0], target: [1, 0, 0] })),
    );

    expect(document.cameras[0].near).toBe(1);
    expect(document.cameras[0].far).toBe(1000);
  });

  it('rolls a camera about the axis it already aims down', () => {
    // Aiming along Z-up +x (Y-up +x) with a 90-degree bank: the aim is unchanged and only the roll differs,
    // which is what distinguishes a bank from a re-aim.
    const rolled = parse3ds(
      buildObjects3ds(
        writeCameraObject({ focalLength: 50, name: 'Rolled', position: [0, 0, 0], roll: 90, target: [1, 0, 0] }),
      ),
    ).cameras[0];
    const level = parse3ds(
      buildObjects3ds(
        writeCameraObject({ focalLength: 50, name: 'Level', position: [0, 0, 0], roll: 0, target: [1, 0, 0] }),
      ),
    ).cameras[0];

    const rolledAim = getAimedDirection(rolled.transform.rotation);
    const levelAim = getAimedDirection(level.transform.rotation);
    expect(rolledAim.x).toBeCloseTo(levelAim.x, 5);
    expect(rolledAim.y).toBeCloseTo(levelAim.y, 5);
    expect(rolledAim.z).toBeCloseTo(levelAim.z, 5);
    // Same aim, different orientation — the bank is real and did not collapse into the aim.
    expect(rolled.transform.rotation.w).not.toBeCloseTo(level.transform.rotation.w, 3);
  });

  it('collects meshes, lights, and cameras from one file without either displacing the others', () => {
    const trimesh = writeChunk(
      THREE_DS_TRIMESH,
      concatBytes(writeVertices([0, 0, 0, 1, 0, 0, 0, 1, 0]), writeFaces([0, 1, 2])),
    );
    const mesh = writeChunk(THREE_DS_OBJECT, concatBytes(writeNullTerminatedString('Tri'), trimesh));
    const document = parse3ds(
      buildObjects3ds(
        mesh,
        writeLightObject({ name: 'Omni01', position: [0, 0, 0] }),
        writeCameraObject({ focalLength: 35, name: 'Camera01', position: [0, 0, 0], target: [0, 1, 0] }),
      ),
    );

    expect(document.meshes).toHaveLength(1);
    expect(document.lights).toHaveLength(1);
    expect(document.cameras).toHaveLength(1);
    // Lights and cameras are placement tables, NOT scene members — the node graph holds the mesh alone.
    expect(document.nodes).toHaveLength(1);
    expect(document.scenes[0].rootNodes).toEqual([0]);
  });

  it('drops and reports 3ds.light-truncated for a light chunk too small for its position', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const light = writeChunk(THREE_DS_LIGHT, new Uint8Array(8)); // 8 bytes: short of the 12-byte position
    const object = writeChunk(THREE_DS_OBJECT, concatBytes(writeNullTerminatedString('Bad'), light));
    const document = parse3ds(buildObjects3ds(object), diagnostics);

    expect(document.lights).toHaveLength(0);
    const crumb = findDiagnostic(diagnostics, '3ds.light-truncated');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
  });

  it('drops and reports 3ds.camera-truncated for a camera chunk too small for its fixed record', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const camera = writeChunk(THREE_DS_CAMERA, new Uint8Array(20)); // short of the 32-byte record
    const object = writeChunk(THREE_DS_OBJECT, concatBytes(writeNullTerminatedString('Bad'), camera));
    const document = parse3ds(buildObjects3ds(object), diagnostics);

    expect(document.cameras).toHaveLength(0);
    const crumb = findDiagnostic(diagnostics, '3ds.camera-truncated');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
  });
});

describe('parse3ds local coordinate system', () => {
  // Builds a TRI_LOCAL chunk (0x4160) from the format's four contiguous 3-vectors: the object's X, Y,
  // and Z axes, then its origin.
  function writeLocalMatrix(
    xAxis: readonly [number, number, number],
    yAxis: readonly [number, number, number],
    zAxis: readonly [number, number, number],
    origin: readonly [number, number, number],
  ): Uint8Array {
    const payload = new Uint8Array(48);
    const view = new DataView(payload.buffer);
    const all = [...xAxis, ...yAxis, ...zAxis, ...origin];
    for (let i = 0; i < 12; i++) view.setFloat32(i * 4, all[i], true);
    return writeChunk(THREE_DS_TRANSFORM_MATRIX, payload);
  }

  function buildTriangleWithMatrix3ds(
    name: string,
    positions: readonly number[],
    indices: readonly number[],
    matrix: Uint8Array | null,
  ): Uint8Array {
    const parts = [writeVertices(positions), writeFaces(indices)];
    if (matrix !== null) parts.push(matrix);
    const trimesh = writeChunk(THREE_DS_TRIMESH, concatBytes(...parts));
    const object = writeChunk(THREE_DS_OBJECT, concatBytes(writeNullTerminatedString(name), trimesh));
    return writeChunk(THREE_DS_MAIN, writeChunk(THREE_DS_EDITOR, object));
  }

  // Re-applies the emitted node transform to the emitted model-space geometry and compares against the
  // file's world-space vertices taken straight through the Z-up→Y-up conversion. This is the invariant
  // that makes TRI_LOCAL support checkable on its own terms: whatever the placement is, localizing by its
  // inverse and then re-applying it must land back where the file put the geometry. A test that only
  // asserted the numbers this parser happens to produce would prove nothing about the decomposition.
  function expectWorldPositionsPreserved(bytes: Uint8Array, worldZUp: readonly number[]): void {
    const document = parse3ds(bytes);
    const geometry = document.meshes[0].geometry;
    const placement = createMatrix4();
    composeMatrix4FromTransform3D(placement, document.nodes[0].transform);

    const expected = Array.from(worldZUp);
    convertPositionsZUpToYUp(expected);

    const local = { x: 0, y: 0, z: 0 };
    const world = createVector3(0, 0, 0);
    for (let v = 0; v < expected.length / 3; v++) {
      expect(getMeshGeometryVertexPosition(local, geometry, v)).toBe(true);
      world.x = local.x;
      world.y = local.y;
      world.z = local.z;
      matrix4TransformPoint(world, placement, world);
      expect(world.x).toBeCloseTo(expected[v * 3], 3);
      expect(world.y).toBeCloseTo(expected[v * 3 + 1], 3);
      expect(world.z).toBeCloseTo(expected[v * 3 + 2], 3);
    }
  }

  it('canonicalizes winding for a mirrored TRI_LOCAL so the surface still faces outward', () => {
    // MODE E, COMPOSED: the other TRI_LOCAL tests here are positions-only at positive scale, where
    // local position identity passes while the orientation is silently wrong. This composes the three
    // facts that only mean something together — the placement really mirrors, the emitted winding is
    // reversed against the file's own face order, and the emitted normal still points the way the
    // file's world-space winding said it did once the node transform is applied.
    //
    // The placement negates X (determinant -1). Localizing by its inverse turns the geometry inside
    // out, so a parser that carries the file's face order straight through derives every normal from
    // an inverted triangle. That is invisible to a positions-only check and invisible to a static
    // render, because the node re-applies the mirror at draw time — it shows up as inside-out lighting.
    const worldZUp = [0, 0, 0, 2, 0, 0, 0, 3, 0];
    const document = parse3ds(
      buildTriangleWithMatrix3ds(
        'Mirrored',
        worldZUp,
        [0, 1, 2],
        writeLocalMatrix([-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, 0]),
      ),
    );
    const geometry = document.meshes[0].geometry;

    // 1) The fixture really is a mirror. Without this the rest proves nothing about mirrored input.
    const placement = createMatrix4();
    composeMatrix4FromTransform3D(placement, document.nodes[0].transform);
    const m = placement.m;
    const determinant =
      m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
    expect(determinant).toBeLessThan(0);

    // 2) The emitted winding is reversed against the file's face order. Corner 1 of the emitted
    //    triangle must be the file's corner 2.
    const corner = { i0: 0, i1: 0, i2: 0 };
    expect(getMeshGeometryTriangleVertexIndices(corner, geometry, 0)).toBe(true);
    const cornerPosition = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(cornerPosition, geometry, corner.i1);
    // File corner 2 is Z-up (0, 3, 0); mirrored to local it stays (0, 3, 0), which is Y-up (0, 0, -3).
    expect(cornerPosition.z).toBeCloseTo(-3, 3);

    // 3) THE PROPERTY THAT MATTERS, and it is asserted through the whole frame rather than one
    //    component: the emitted normal, carried through the node placement by the inverse-transpose a
    //    renderer uses, must agree with the face normal the FILE's world-space winding describes.
    const worldYUp = Array.from(worldZUp);
    convertPositionsZUpToYUp(worldYUp);
    const e1 = [worldYUp[3] - worldYUp[0], worldYUp[4] - worldYUp[1], worldYUp[5] - worldYUp[2]];
    const e2 = [worldYUp[6] - worldYUp[0], worldYUp[7] - worldYUp[1], worldYUp[8] - worldYUp[2]];
    const fileNormal = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];

    const normal = createVector3(0, 0, 0);
    expect(getMeshGeometryVertexNormal(normal, geometry, corner.i0)).toBe(true);
    const normalMatrix = createMatrix4();
    expect(inverseMatrix4(normalMatrix, placement)).toBe(true);
    transposeMatrix4(normalMatrix, normalMatrix);
    const transformed = { w: 0, x: 0, y: 0, z: 0 };
    matrix4TransformVector(transformed, normalMatrix, { w: 0, x: normal.x, y: normal.y, z: normal.z });
    const dot = transformed.x * fileNormal[0] + transformed.y * fileNormal[1] + transformed.z * fileNormal[2];
    expect(dot).toBeGreaterThan(0);
  });

  it('moves a translated placement off the geometry and onto the node transform', () => {
    // The object sits at Z-up (10, 20, 30) and its vertices are stored already displaced to there.
    const world = [10, 20, 30, 11, 20, 30, 10, 21, 30];
    const document = parse3ds(
      buildTriangleWithMatrix3ds(
        'Moved',
        world,
        [0, 1, 2],
        writeLocalMatrix([1, 0, 0], [0, 1, 0], [0, 0, 1], [10, 20, 30]),
      ),
    );

    // Z-up (10, 20, 30) is Y-up (10, 30, -20): the placement rides the node...
    const position = document.nodes[0].transform.position;
    expect(position.x).toBeCloseTo(10, 4);
    expect(position.y).toBeCloseTo(30, 4);
    expect(position.z).toBeCloseTo(-20, 4);

    // ...and the geometry is back at its own origin rather than baked out at the world offset.
    const local = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(local, document.meshes[0].geometry, 0);
    expect(local.x).toBeCloseTo(0, 4);
    expect(local.y).toBeCloseTo(0, 4);
    expect(local.z).toBeCloseTo(0, 4);
  });

  it('preserves world positions through a translated placement', () => {
    const world = [10, 20, 30, 11, 20, 30, 10, 21, 30];
    expectWorldPositionsPreserved(
      buildTriangleWithMatrix3ds(
        'Moved',
        world,
        [0, 1, 2],
        writeLocalMatrix([1, 0, 0], [0, 1, 0], [0, 0, 1], [10, 20, 30]),
      ),
      world,
    );
  });

  it('preserves world positions through a rotated and translated placement', () => {
    // A 90-degree rotation about the file's Z axis, placed away from the origin — the case where a
    // careless conversion (rotating the matrix instead of conjugating it) lands the geometry elsewhere.
    const world = [1, 2, 3, 4, 5, 6, -7, 8, -9];
    expectWorldPositionsPreserved(
      buildTriangleWithMatrix3ds(
        'Rotated',
        world,
        [0, 1, 2],
        writeLocalMatrix([0, 1, 0], [-1, 0, 0], [0, 0, 1], [5, -5, 2]),
      ),
      world,
    );
  });

  it('preserves world positions through a non-uniformly scaled placement', () => {
    const world = [2, 4, 6, 8, 10, 12, 14, 16, 18];
    expectWorldPositionsPreserved(
      buildTriangleWithMatrix3ds(
        'Scaled',
        world,
        [0, 1, 2],
        writeLocalMatrix([2, 0, 0], [0, 3, 0], [0, 0, 4], [1, 1, 1]),
      ),
      world,
    );
  });

  it('leaves the node at identity and the geometry untouched when the mesh carries no TRI_LOCAL', () => {
    const world = [10, 20, 30, 11, 20, 30, 10, 21, 30];
    const document = parse3ds(buildTriangleWithMatrix3ds('Plain', world, [0, 1, 2], null));

    const transform = document.nodes[0].transform;
    expect(transform.position.x).toBe(0);
    expect(transform.position.y).toBe(0);
    expect(transform.position.z).toBe(0);
    expect(transform.scale.x).toBe(1);

    // Z-up (10, 20, 30) → Y-up (10, 30, -20), straight through with no localization.
    const local = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(local, document.meshes[0].geometry, 0);
    expect(local.x).toBeCloseTo(10, 4);
    expect(local.y).toBeCloseTo(30, 4);
    expect(local.z).toBeCloseTo(-20, 4);
  });

  it('recovers and reports 3ds.local-matrix-singular for a placement that cannot be inverted', () => {
    // A collapsed basis (a zero Z axis) has no inverse. The geometry stays in world space and the node
    // keeps its identity transform — the pre-TRI_LOCAL behavior, which still renders correctly.
    const diagnostics: ImportDiagnostic[] = [];
    const world = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const document = parse3ds(
      buildTriangleWithMatrix3ds(
        'Singular',
        world,
        [0, 1, 2],
        writeLocalMatrix([1, 0, 0], [0, 1, 0], [0, 0, 0], [0, 0, 0]),
      ),
      diagnostics,
    );

    const crumb = findDiagnostic(diagnostics, '3ds.local-matrix-singular');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(document.nodes[0].transform.position.x).toBe(0);

    const local = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(local, document.meshes[0].geometry, 0);
    expect(local.x).toBeCloseTo(1, 4);
  });

  it('recovers and reports 3ds.local-matrix-truncated for a TRI_LOCAL chunk short of its twelve floats', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const short = writeChunk(THREE_DS_TRANSFORM_MATRIX, new Uint8Array(24)); // six floats, not twelve
    const document = parse3ds(
      buildTriangleWithMatrix3ds('Short', [1, 2, 3, 4, 5, 6, 7, 8, 9], [0, 1, 2], short),
      diagnostics,
    );

    const crumb = findDiagnostic(diagnostics, '3ds.local-matrix-truncated');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(document.nodes[0].transform.position.x).toBe(0);
  });
});

describe('parse3ds opacity map', () => {
  it('binds MAT_OPACMAP as the material alpha map and makes it actually blend', () => {
    // An alphaMap is INERT while alphaMode is 'opaque', so binding one without also leaving opaque mode
    // would import the authored coverage image into a slot the renderer never reads. This material states
    // NO scalar transparency, so the map alone has to be what flips the mode.
    const material = writeMaterial({ diffuse: [255, 255, 255], name: 'Fence', opacityFilename: 'fence_a.png' });
    const document = parse3ds(
      buildMaterialScene3D3ds({
        faceMaterialName: 'Fence',
        indices: [0, 1, 2],
        material,
        meshName: 'Plane',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      }),
    );

    const parsed = document.materials[0] as BlinnPhongMaterial;
    expect(parsed.alphaMap).not.toBeNull();
    expect(parsed.alphaMode).toBe('blend');
    const resource = getTestTextureResource(document.resources, parsed.alphaMap!);
    expect((resource as ExternalImageResourceReference).uri).toBe('fence_a.png');
  });

  it('keeps the scalar transparency alongside the opacity map', () => {
    // MAT_TRANSPARENCY and MAT_OPACMAP are independent terms that multiply — reading the map must not
    // discard the scalar the author also set.
    const material = writeMaterial({
      diffuse: [255, 255, 255],
      name: 'Glass',
      opacityFilename: 'smudge.png',
      transparencyPercent: 40,
    });
    const document = parse3ds(
      buildMaterialScene3D3ds({
        faceMaterialName: 'Glass',
        indices: [0, 1, 2],
        material,
        meshName: 'Pane',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      }),
    );

    const parsed = document.materials[0] as BlinnPhongMaterial;
    expect(parsed.alphaMap).not.toBeNull();
    // 40% transparent → 0.6 alpha in the packed diffuse color's low byte.
    expect(parsed.diffuse & 0xff).toBe(Math.round(0.6 * 255));
  });

  it('leaves the alpha map null and the material opaque when the file states no MAT_OPACMAP', () => {
    const material = writeMaterial({ diffuse: [255, 255, 255], name: 'Solid' });
    const document = parse3ds(
      buildMaterialScene3D3ds({
        faceMaterialName: 'Solid',
        indices: [0, 1, 2],
        material,
        meshName: 'Box',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      }),
    );

    const parsed = document.materials[0] as BlinnPhongMaterial;
    expect(parsed.alphaMap).toBeNull();
    expect(parsed.alphaMode).toBe('opaque');
  });
});
