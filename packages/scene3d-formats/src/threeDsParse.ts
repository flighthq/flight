import {
  createMatrix4,
  createQuaternion,
  createTransform3D,
  createVector3,
  decomposeMatrix4ToTransform3D,
  inverseMatrix4,
  matrix4TransformPoint,
  multiplyMatrix4,
  multiplyQuaternion,
  normalizeVector3,
  setQuaternionFromAxisAngle,
  setQuaternionFromUnitVectors,
  subtractVector3,
} from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createPointLight, createSpotLight } from '@flighthq/lighting/contract';
import { createBlinnPhongMaterial } from '@flighthq/materials/contract';
import { DEG_TO_RAD } from '@flighthq/math/contract';
import { createMeshGeometry } from '@flighthq/mesh/contract';
import { createScene3DFromDocument } from '@flighthq/scene3d/contract';
import type {
  ImportDiagnostic,
  Light,
  Material,
  MaterialLike,
  MeshSubset,
  Scene3D,
  Scene3DDocument,
  Scene3DDocumentMesh,
  Scene3DDocumentNode,
  ThreeDsCamera,
  ThreeDsLight,
  ThreeDsMaterial,
  ThreeDsMaterialGroup,
  ThreeDsMesh,
  Transform3D,
  Vector3,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, MeshKind } from '@flighthq/types/contract';
import {
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_COLOR_BYTE,
  THREE_DS_COLOR_FLOAT,
  THREE_DS_EDITOR,
  THREE_DS_FACE_MATERIAL,
  THREE_DS_FACES,
  THREE_DS_CAMERA,
  THREE_DS_CAMERA_APERTURE_MM,
  THREE_DS_CAMERA_RANGES,
  THREE_DS_LIGHT,
  THREE_DS_LIGHT_INNER_RANGE,
  THREE_DS_LIGHT_MULTIPLIER,
  THREE_DS_LIGHT_OFF,
  THREE_DS_LIGHT_OUTER_RANGE,
  THREE_DS_LIGHT_SPOT,
  THREE_DS_MAIN,
  THREE_DS_MATERIAL,
  THREE_DS_MATERIAL_AMBIENT,
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
  THREE_DS_PERCENT_FLOAT,
  THREE_DS_PERCENT_INT,
  THREE_DS_SMOOTH_GROUP,
  THREE_DS_TRANSFORM_MATRIX,
  THREE_DS_TRIMESH,
  THREE_DS_UV_COORDS,
  THREE_DS_VERTICES,
} from '@flighthq/types/contract';

import {
  CANONICAL_FLOATS_PER_VERTEX,
  CANONICAL_LAYOUT,
  convertPositionsZUpToYUp,
  createExternalTextureRef,
} from './shared';

// Parses an Autodesk 3DS binary file into a Scene3D. The 3DS format is a recursive chunk tree
// (little-endian): each chunk has a uint16 ID, a uint32 total length (including the 6-byte header),
// and a payload of sub-chunks and/or inline data. The editor chunk (0x3D3D) contains named objects
// (0x4000), each of which may contain a triangle mesh (0x4100) with vertex, face, and UV sub-chunks.
//
// Each mesh becomes a Mesh scene node with the canonical PBR vertex layout. The 3DS coordinate
// system is right-handed Z-up (like MD2/MD5); positions are converted to Flight's right-handed
// Y-up via convertPositionsZUpToYUp, a -90° rotation about X ((x, y, z) → (x, z, -y), det = +1).
// Because the conversion is a rotation, not a reflection, triangle winding and computed normals are
// preserved as-is from the file — no winding reversal is needed.
//
// ★ THAT CONCLUSION RESTS ON TWO LINKS, AND EXACTLY ONE OF THEM IS UNVERIFIED.
//   1. "The conversion preserves winding" — VERIFIED, and re-verifiable in seconds. threeDsParse.test.ts
//      parses a synthetic closed cube of known outward winding and asserts POSITIVE signed volume on the
//      emitted geometry. Signed volume is computed from positions and indices alone, so it shares no term
//      with the normal pass and can genuinely disagree with it.
//   2. "3DS files are authored counter-clockwise-front" — UNVERIFIED. It is a claim about the FORMAT, and
//      no synthetic file can establish it: a fixture proves only what its author already believed. It
//      needs an external corpus, and is labelled rather than argued.
// The label is deliberate. Filling link 2 in from reasoning would convert "unchecked" into "stated and
// unchecked", which reads as verified and is strictly worse than an admitted gap. If 3DS import becomes
// load-bearing, measure link 2 against real files; until then this comment is the honest state.
//
// Why signed volume rather than the authored-normal check the MD2 importer uses: 3DS carries NO authored
// normals — its per-face normals come from the same edge cross product a winding check would use — so
// comparing winding against them would compare a quantity with itself and pass by construction.
//
// The 3DS format limits each mesh to 65535 vertices (uint16 indices). Multiple mesh objects are
// common in practice and each becomes a separate Mesh child of the scene.
//
// Malformed or truncated input records a diagnostic and returns an empty or partial scene; the function
// never throws on bad input. Convenience over `createScene3DFromDocument(parse3ds(bytes))`.
export function createScene3DFrom3ds(bytes: Readonly<Uint8Array>, diagnostics?: ImportDiagnostic[]): Scene3D {
  return createScene3DFromDocument(parse3ds(bytes, diagnostics));
}

// Parses an Autodesk 3DS binary file into a format-neutral Scene3DDocument. Each named-object trimesh
// becomes one document Mesh node (inline geometry, canonical PBR layout, RH Z-up → Y-up). Referenced
// materials are registered into the document's materials table (deduped by name) and named per mesh by
// index. Assemble into a live Scene3D with `createScene3DFromDocument`. Malformed input returns an empty or
// partial document with a diagnostic.
export function parse3ds(bytes: Readonly<Uint8Array>, diagnostics?: ImportDiagnostic[]): Scene3DDocument {
  const document: Scene3DDocument = {
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

  if (bytes.byteLength < THREE_DS_CHUNK_HEADER_BYTES) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, '3ds.input-too-small', 'parse3ds');
    return document;
  }

  const source = bytes as Uint8Array;
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);

  const mainId = view.getUint16(0, true);
  if (mainId !== THREE_DS_MAIN) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, '3ds.wrong-main-chunk', 'parse3ds', {
      foundId: mainId,
    });
    return document;
  }

  // The material table (0xAFFF chunks) and the meshes are siblings under the editor chunk, and a mesh
  // references its materials by name via FACE_MATERIAL — so collect the whole table first, then
  // resolve each mesh's referenced names against it.
  const threeDsDrops = diagnostics ? new Map<string, ThreeDsDropTally>() : null;
  const materials = new Map<string, ThreeDsMaterial>();
  const meshes: ThreeDsMesh[] = [];
  const lights: ThreeDsLight[] = [];
  const cameras: ThreeDsCamera[] = [];
  collectThreeDsObjects(view, 0, materials, meshes, lights, cameras, threeDsDrops);
  // The keyframer is walked for PIVOTS ONLY (see collectThreeDsPivots). It is a sibling of the editor
  // chunk, so it is collected separately rather than during the object walk.
  const pivots = collectThreeDsPivots(view, 0);
  const materialIndexByName = new Map<string, number>();
  for (let i = 0; i < meshes.length; i++) {
    appendMeshDocument(meshes[i], materials, materialIndexByName, pivots, document, threeDsDrops);
  }
  // Lights and cameras fill the document's PLACEMENT TABLES, not the node graph — neither is a scene
  // member in Flight (see Scene3DDocumentLight). They are appended after the meshes so the tables read in
  // file order regardless of how the objects were interleaved in the chunk tree.
  for (let i = 0; i < lights.length; i++) appendThreeDsLightDocument(lights[i], document, threeDsDrops);
  for (let i = 0; i < cameras.length; i++) appendThreeDsCameraDocument(cameras[i], document);

  // parse3ds is the single physical emitter for every aggregated crumb (hence the origin); the tallies
  // store no origin. Flush once so per-chunk faults collapse to one crumb per kind/discriminator + count.
  if (threeDsDrops !== null) {
    for (const tally of threeDsDrops.values()) {
      reportImportDiagnostic(diagnostics, tally.severity, tally.kind, 'parse3ds', {
        ...tally.detail,
        count: tally.count,
      });
    }
  }

  return document;
}

// Recursively walks the chunk tree starting at `offset`, appending every named object it finds to the
// collector matching that object's kind — trimesh, light, or camera — and populating `materials` with
// every material block (0xAFFF) found alongside them under the editor chunk. All four collectors are
// out-parameters because one walk feeds all of them; a 3DS object chunk does not say which kind it is
// until its sub-chunk is read.
function collectThreeDsObjects(
  view: Readonly<DataView>,
  offset: number,
  materials: Map<string, ThreeDsMaterial>,
  meshes: ThreeDsMesh[],
  lights: ThreeDsLight[],
  cameras: ThreeDsCamera[],
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): void {
  const end = Math.min(offset + readChunkLength(view, offset), view.byteLength);
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;

  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkLength = readChunkLength(view, cursor);
    const chunkEnd = readChunkEnd(view, cursor, end);

    if (chunkEnd < 0) {
      tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Recover, '3ds.chunk-exceeds-parent', '', {
        firstChunkId: chunkId,
        firstLength: chunkLength,
        firstOffset: cursor,
      });
      break;
    }

    if (chunkId === THREE_DS_EDITOR || chunkId === THREE_DS_MAIN) {
      collectThreeDsObjects(view, cursor, materials, meshes, lights, cameras, threeDsDrops);
    } else if (chunkId === THREE_DS_OBJECT) {
      parseThreeDsObject(view, cursor, chunkEnd, meshes, lights, cameras, threeDsDrops);
    } else if (chunkId === THREE_DS_MATERIAL) {
      const material = parseMaterial(view, cursor, chunkEnd);
      if (material.name.length > 0) materials.set(material.name, material);
    }

    cursor = chunkEnd;
  }
}

// Parses a named object chunk (0x4000). The payload starts with a null-terminated ASCII name string,
// followed by sub-chunks. The object's kind is whichever of the three entity sub-chunks it carries — a
// trimesh (0x4100), a light (0x4600), or a camera (0x4700) — so the first one found decides, and the
// parsed descriptor is appended to that kind's collector.
function parseThreeDsObject(
  view: Readonly<DataView>,
  offset: number,
  end: number,
  meshes: ThreeDsMesh[],
  lights: ThreeDsLight[],
  cameras: ThreeDsCamera[],
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): void {
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
  const name = readNullTerminatedString(view, cursor, end);
  cursor += name.length + 1; // advance past the name and null terminator

  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);

    if (chunkEnd < 0) {
      tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Recover, '3ds.subchunk-exceeds-object', '', {
        firstOffset: cursor,
      });
      return;
    }

    if (chunkId === THREE_DS_TRIMESH) {
      const mesh = parseTrimesh(view, cursor, chunkEnd, name, threeDsDrops);
      if (mesh !== null) meshes.push(mesh);
      return;
    }
    if (chunkId === THREE_DS_LIGHT) {
      const light = parseThreeDsLight(view, cursor, chunkEnd, name, threeDsDrops);
      if (light !== null) lights.push(light);
      return;
    }
    if (chunkId === THREE_DS_CAMERA) {
      const camera = parseThreeDsCamera(view, cursor, chunkEnd, name, threeDsDrops);
      if (camera !== null) cameras.push(camera);
      return;
    }

    cursor = chunkEnd;
  }

  // A named object carrying none of the three entity sub-chunks — a dummy/helper object (a pivot, a
  // target point, a group node). Flight models no such entity, so the object is recognized and skipped.
  tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Skip, '3ds.non-entity-object', '', { firstName: name });
}

// Parses a light chunk (0x4600). The payload is the light's position (3 float32) followed by sub-chunks
// carrying its color, intensity multiplier, ranges, and — if the light is a spot — its aim and cone.
// Returns null when the payload is too short to hold the position.
function parseThreeDsLight(
  view: Readonly<DataView>,
  offset: number,
  end: number,
  name: string,
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): ThreeDsLight | null {
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
  if (cursor + 12 > end) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Drop, '3ds.light-truncated', '', { firstName: name });
    return null;
  }

  const position: readonly [number, number, number] = [
    view.getFloat32(cursor, true),
    view.getFloat32(cursor + 4, true),
    view.getFloat32(cursor + 8, true),
  ];
  cursor += 12;

  // A light with no color chunk is full-intensity white, and one with no multiplier is unscaled — both
  // are spec defaults, not absences to report.
  let color: readonly [number, number, number] = [1, 1, 1];
  let enabled = true;
  let falloff = 0;
  let hotspot = 0;
  let innerRange: number | null = null;
  let multiplier = 1;
  let outerRange: number | null = null;
  let target: readonly [number, number, number] | null = null;

  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) {
      tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Recover, '3ds.subchunk-exceeds-light', '', {
        firstName: name,
      });
      break;
    }
    const dataStart = cursor + THREE_DS_CHUNK_HEADER_BYTES;

    if (chunkId === THREE_DS_COLOR_FLOAT || chunkId === THREE_DS_COLOR_BYTE) {
      // A light's color chunk is a DIRECT sub-chunk, not wrapped in a material color block, so the scan
      // range starts at this chunk's own header rather than at its payload.
      const parsed = parseColorChunk(view, cursor, chunkEnd);
      if (parsed !== null) color = parsed;
    } else if (chunkId === THREE_DS_LIGHT_OFF) {
      enabled = false;
    } else if (chunkId === THREE_DS_LIGHT_MULTIPLIER) {
      if (dataStart + 4 <= chunkEnd) multiplier = view.getFloat32(dataStart, true);
    } else if (chunkId === THREE_DS_LIGHT_INNER_RANGE) {
      if (dataStart + 4 <= chunkEnd) innerRange = view.getFloat32(dataStart, true);
    } else if (chunkId === THREE_DS_LIGHT_OUTER_RANGE) {
      if (dataStart + 4 <= chunkEnd) outerRange = view.getFloat32(dataStart, true);
    } else if (chunkId === THREE_DS_LIGHT_SPOT) {
      // The spot sub-chunk states an aim TARGET POINT, then the two cone angles. Its presence is what
      // makes this a spot light rather than a point light.
      if (dataStart + 20 <= chunkEnd) {
        target = [
          view.getFloat32(dataStart, true),
          view.getFloat32(dataStart + 4, true),
          view.getFloat32(dataStart + 8, true),
        ];
        hotspot = view.getFloat32(dataStart + 12, true);
        falloff = view.getFloat32(dataStart + 16, true);
      } else {
        tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Recover, '3ds.light-spot-truncated', '', {
          firstName: name,
        });
      }
    }

    cursor = chunkEnd;
  }

  return { color, enabled, falloff, hotspot, innerRange, multiplier, name, outerRange, position, target };
}

// Parses a camera chunk (0x4700). The payload is a fixed 32-byte record — position (3 float32), aim
// target (3 float32), bank/roll angle in degrees, and lens focal length in millimetres — followed by
// sub-chunks, of which only CAM_RANGES carries data Flight models. Returns null when the payload is too
// short to hold the fixed record.
function parseThreeDsCamera(
  view: Readonly<DataView>,
  offset: number,
  end: number,
  name: string,
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): ThreeDsCamera | null {
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
  if (cursor + 32 > end) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Drop, '3ds.camera-truncated', '', { firstName: name });
    return null;
  }

  const position: readonly [number, number, number] = [
    view.getFloat32(cursor, true),
    view.getFloat32(cursor + 4, true),
    view.getFloat32(cursor + 8, true),
  ];
  const target: readonly [number, number, number] = [
    view.getFloat32(cursor + 12, true),
    view.getFloat32(cursor + 16, true),
    view.getFloat32(cursor + 20, true),
  ];
  const roll = view.getFloat32(cursor + 24, true);
  const focalLength = view.getFloat32(cursor + 28, true);
  cursor += 32;

  let far: number | null = null;
  let near: number | null = null;

  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) {
      tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Recover, '3ds.subchunk-exceeds-camera', '', {
        firstName: name,
      });
      break;
    }
    const dataStart = cursor + THREE_DS_CHUNK_HEADER_BYTES;

    if (chunkId === THREE_DS_CAMERA_RANGES && dataStart + 8 <= chunkEnd) {
      near = view.getFloat32(dataStart, true);
      far = view.getFloat32(dataStart + 4, true);
    }

    cursor = chunkEnd;
  }

  return { far, focalLength, name, near, position, roll, target };
}

// Parses a trimesh chunk (0x4100) and its sub-chunks (vertices, faces, UVs) into a ThreeDsMesh
// descriptor.
function parseTrimesh(
  view: Readonly<DataView>,
  offset: number,
  end: number,
  name: string,
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): ThreeDsMesh | null {
  let vertices: Float32Array | null = null;
  let faces: Uint16Array | null = null;
  let uvs: Float32Array | null = null;
  let localMatrix: Float32Array | null = null;
  let materialGroups: readonly ThreeDsMaterialGroup[] = [];
  let smoothingGroups: Uint32Array | null = null;

  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;

  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);

    if (chunkEnd < 0) {
      tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Recover, '3ds.subchunk-exceeds-trimesh', '', {
        firstChunkId: chunkId,
        firstName: name,
      });
      break;
    }

    const dataStart = cursor + THREE_DS_CHUNK_HEADER_BYTES;

    if (chunkId === THREE_DS_VERTICES) {
      vertices = parseVertices(view, dataStart, chunkEnd, threeDsDrops);
    } else if (chunkId === THREE_DS_FACES) {
      const parsed = parseFaces(view, dataStart, chunkEnd, threeDsDrops);
      if (parsed !== null) {
        faces = parsed.faces;
        materialGroups = parsed.materialGroups;
        smoothingGroups = parsed.smoothingGroups;
      }
    } else if (chunkId === THREE_DS_UV_COORDS) {
      uvs = parseUvCoords(view, dataStart, chunkEnd, threeDsDrops);
    } else if (chunkId === THREE_DS_TRANSFORM_MATRIX) {
      localMatrix = parseLocalMatrix(view, dataStart, chunkEnd, name, threeDsDrops);
    }

    cursor = chunkEnd;
  }

  if (vertices === null || faces === null) {
    tallyThreeDsDrop(
      threeDsDrops,
      ImportDiagnosticSeverity.Drop,
      '3ds.mesh-missing-geometry',
      vertices === null ? 'vertices' : 'faces',
      { firstName: name, missing: vertices === null ? 'vertices' : 'faces' },
    );
    return null;
  }

  return { faces, localMatrix, materialGroups, name, smoothingGroups, uvs, vertices };
}

// Reads a TRI_LOCAL chunk (0x4160): 12 float32 forming the object's placement as four contiguous
// 3-vectors — its X, Y, and Z axes, then its origin. Returns them in file order; the caller builds the
// matrix. Returns null when the chunk is too short to hold all twelve.
function parseLocalMatrix(
  view: Readonly<DataView>,
  offset: number,
  end: number,
  name: string,
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): Float32Array | null {
  if (offset + 48 > end) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Recover, '3ds.local-matrix-truncated', '', {
      firstName: name,
    });
    return null;
  }
  const values = new Float32Array(12);
  for (let i = 0; i < 12; i++) values[i] = view.getFloat32(offset + i * 4, true);
  return values;
}

// Reads the vertex list sub-chunk (0x4110): uint16 count followed by count * 3 float32 values
// (x, y, z per vertex).
function parseVertices(
  view: Readonly<DataView>,
  dataStart: number,
  end: number,
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): Float32Array | null {
  if (dataStart + 2 > end) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Drop, '3ds.vertices-truncated', 'no-count', {
      reason: 'no-count',
    });
    return null;
  }
  const count = view.getUint16(dataStart, true);
  const floatsNeeded = count * 3;
  const bytesNeeded = dataStart + 2 + floatsNeeded * 4;
  if (bytesNeeded > end) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Drop, '3ds.vertices-truncated', 'truncated', {
      firstCount: count,
      reason: 'truncated',
    });
    return null;
  }
  const vertices = new Float32Array(floatsNeeded);
  let offset = dataStart + 2;
  for (let i = 0; i < floatsNeeded; i++) {
    vertices[i] = view.getFloat32(offset, true);
    offset += 4;
  }
  return vertices;
}

// Reads the face list sub-chunk (0x4120): uint16 count followed by count * 4 uint16 values
// (v0, v1, v2, flags per face). Only the first 3 values (triangle indices) are kept. Two sub-chunks
// follow the face array within the same chunk: FACE_MATERIAL (0x4130) — a material name plus the list of
// face indices that use it, one per material subset — and SMOOTH_GROUP (0x4150) — one uint32 smoothing
// bitmask per face. Returns the triangle indices, the per-material face groups, and the smoothing masks.
function parseFaces(
  view: Readonly<DataView>,
  dataStart: number,
  end: number,
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): { faces: Uint16Array; materialGroups: readonly ThreeDsMaterialGroup[]; smoothingGroups: Uint32Array | null } | null {
  if (dataStart + 2 > end) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Drop, '3ds.faces-truncated', 'no-count', {
      reason: 'no-count',
    });
    return null;
  }
  const count = view.getUint16(dataStart, true);
  const facesEnd = dataStart + 2 + count * 4 * 2;
  if (facesEnd > end) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Drop, '3ds.faces-truncated', 'truncated', {
      firstCount: count,
      reason: 'truncated',
    });
    return null;
  }
  const faces = new Uint16Array(count * 3);
  let offset = dataStart + 2;
  for (let i = 0; i < count; i++) {
    faces[i * 3] = view.getUint16(offset, true);
    faces[i * 3 + 1] = view.getUint16(offset + 2, true);
    faces[i * 3 + 2] = view.getUint16(offset + 4, true);
    // Skip the 4th uint16 (flags).
    offset += 8;
  }

  // Sub-chunks (FACE_MATERIAL, SMOOTH_GROUP, …) follow the face array up to the chunk boundary.
  const materialGroups: ThreeDsMaterialGroup[] = [];
  let smoothingGroups: Uint32Array | null = null;
  let cursor = facesEnd;
  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const subId = view.getUint16(cursor, true);
    const subLength = readChunkLength(view, cursor);
    const subEnd = cursor + subLength;
    if (subLength < THREE_DS_CHUNK_HEADER_BYTES || subEnd > end) {
      // The faces survive; only trailing FACE_MATERIAL/SMOOTH_GROUP sub-chunks past this malformed one are
      // abandoned — a break-keeps-parsed recovery, mirroring the chunk-exceeds guards in the sibling walks.
      tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Recover, '3ds.face-subchunk-exceeds', '', {});
      break;
    }
    const dataOffset = cursor + THREE_DS_CHUNK_HEADER_BYTES;
    if (subId === THREE_DS_FACE_MATERIAL) {
      const group = parseFaceMaterialGroup(view, dataOffset, subEnd, count, threeDsDrops);
      if (group !== null) materialGroups.push(group);
    } else if (subId === THREE_DS_SMOOTH_GROUP) {
      smoothingGroups = parseSmoothingGroups(view, dataOffset, subEnd, count, threeDsDrops);
    }
    cursor = subEnd;
  }

  return { faces, materialGroups, smoothingGroups };
}

// Reads one FACE_MATERIAL (0x4130) group: a null-terminated material name, then uint16 nFaces, then
// nFaces uint16 face indices (into the mesh's triangle list) that bind that material. Returns null for a
// nameless or truncated group. Face indices past the mesh's face count are dropped with a warning.
function parseFaceMaterialGroup(
  view: Readonly<DataView>,
  dataStart: number,
  end: number,
  faceCount: number,
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): ThreeDsMaterialGroup | null {
  const name = readNullTerminatedString(view, dataStart, end);
  if (name.length === 0) return null;
  let offset = dataStart + name.length + 1; // past the name and null terminator
  if (offset + 2 > end) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Drop, '3ds.material-group-truncated', 'no-count', {
      firstName: name,
      reason: 'no-count',
    });
    return null;
  }
  const groupFaceCount = view.getUint16(offset, true);
  offset += 2;
  if (offset + groupFaceCount * 2 > end) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Drop, '3ds.material-group-truncated', 'truncated', {
      firstCount: groupFaceCount,
      firstName: name,
      reason: 'truncated',
    });
    return null;
  }
  const faces = new Uint16Array(groupFaceCount);
  let kept = 0;
  for (let i = 0; i < groupFaceCount; i++) {
    const faceIndex = view.getUint16(offset + i * 2, true);
    if (faceIndex < faceCount) faces[kept++] = faceIndex;
  }
  if (kept < groupFaceCount) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Recover, '3ds.material-group-face-out-of-range', '', {
      firstFaceCount: faceCount,
      firstName: name,
    });
  }
  return { faces: faces.subarray(0, kept), name };
}

// Reads the SMOOTH_GROUP (0x4150) sub-chunk: one uint32 smoothing-group bitmask per face. Two faces
// share a smoothed vertex normal only where their masks share a set bit; a face with mask 0 is flat.
// Returns null when the chunk is truncated (the mesh then smooths every shared vertex).
function parseSmoothingGroups(
  view: Readonly<DataView>,
  dataStart: number,
  end: number,
  faceCount: number,
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): Uint32Array | null {
  if (dataStart + faceCount * 4 > end) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Recover, '3ds.smoothing-truncated', '', {
      firstFaceCount: faceCount,
    });
    return null;
  }
  const groups = new Uint32Array(faceCount);
  for (let i = 0; i < faceCount; i++) groups[i] = view.getUint32(dataStart + i * 4, true);
  return groups;
}

// Reads the UV coordinate sub-chunk (0x4140): uint16 count followed by count * 2 float32 values
// (u, v per vertex). The UV array is 1:1 with the vertex array — no re-indexing needed.
function parseUvCoords(
  view: Readonly<DataView>,
  dataStart: number,
  end: number,
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): Float32Array | null {
  if (dataStart + 2 > end) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Recover, '3ds.uv-truncated', 'no-count', {
      reason: 'no-count',
    });
    return null;
  }
  const count = view.getUint16(dataStart, true);
  const floatsNeeded = count * 2;
  const bytesNeeded = dataStart + 2 + floatsNeeded * 4;
  if (bytesNeeded > end) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Recover, '3ds.uv-truncated', 'truncated', {
      firstCount: count,
      reason: 'truncated',
    });
    return null;
  }
  const uvCoords = new Float32Array(floatsNeeded);
  let offset = dataStart + 2;
  for (let i = 0; i < floatsNeeded; i++) {
    uvCoords[i] = view.getFloat32(offset, true);
    offset += 4;
  }
  return uvCoords;
}

// Builds a Mesh scene node from a parsed ThreeDsMesh descriptor. Vertex positions are converted from RH
// Z-up to RH Y-up via convertPositionsZUpToYUp. Normals are generated per smoothing group — a vertex
// shared by faces in different smoothing groups is split so each side keeps its own normal (so hard edges
// stay hard) — and the geometry is partitioned into one MeshSubset per FACE_MATERIAL group, with any
// faces belonging to no group forming a trailing default subset. Materials are resolved against the
// file's material table (memoized in `materialIndexByName`) and named per subset by index (-1 = default).
function appendMeshDocument(
  mesh: Readonly<ThreeDsMesh>,
  materials: Readonly<Map<string, ThreeDsMaterial>>,
  materialIndexByName: Map<string, number>,
  pivots: Readonly<Map<string, readonly [number, number, number]>>,
  document: Scene3DDocument,
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): void {
  const vertexCount = mesh.vertices.length / 3;
  const faceCount = mesh.faces.length / 3;

  // A parsed-but-empty trimesh (no vertices or no faces) yields no document mesh — an omitted element,
  // mirroring md5mesh.mesh-empty.
  if (vertexCount === 0 || faceCount === 0) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Drop, '3ds.mesh-empty', '', { firstName: mesh.name });
    return;
  }

  // 3DS stores vertices in WORLD space. Applying TRI_LOCAL's inverse recovers the model-space geometry
  // the placement was applied to, so the node can carry that placement as a real transform instead of an
  // identity — which is what lets a pivot rotation or an animation channel drive the object at all. This
  // is render-neutral for a static scene by construction (localize, then re-apply, is the identity), and
  // runs in the file's own Z-up space BEFORE the Y-up conversion so one seam still owns that rotation.
  const positions = Array.from(mesh.vertices);
  const transform = createTransform3D();
  const pivot = pivots.get(mesh.name) ?? null;
  let localized = false;
  if (mesh.localMatrix !== null) {
    localized = localizeThreeDsPositions(positions, mesh.localMatrix, pivot, transform, mesh.name, threeDsDrops);
  }

  // A TRI_LOCAL that mirrors (negative determinant) means localizing by its inverse turned the geometry
  // inside out: the file's world-space winding, applied to model-space positions, now faces inward. The
  // node re-applies the mirror at draw time so a static render still looks right, but everything derived
  // from winding BELOW — the face normals, and the tangent handedness built on them — would be derived
  // from the inverted order and come out pointing into the surface. So the winding is canonicalized here,
  // before any of that, rather than left for a renderer to compensate for. Only when the localization
  // actually ran: a singular matrix leaves the geometry in world space with nothing to correct.
  const faces =
    localized && mesh.localMatrix !== null && threeDsLocalMatrixDeterminant(mesh.localMatrix) < 0
      ? reverseThreeDsFaceWinding(mesh.faces)
      : mesh.faces;

  // Convert positions from RH Z-up to RH Y-up before normal computation so all geometry operates in
  // Flight's coordinate space. The rotation preserves winding, so computed normals face outward.
  convertPositionsZUpToYUp(positions);

  // Per-face normals, area-weighted (the raw edge cross product, magnitude ∝ 2×area). Faces that
  // reference a vertex past the buffer are skipped from all normal/emit work.
  const faceNormals = new Float64Array(faceCount * 3);
  const incidentFaces: number[][] = Array.from({ length: vertexCount }, () => []);
  const faceValid = new Uint8Array(faceCount);
  let droppedFaces = 0;
  for (let f = 0; f < faceCount; f++) {
    const i0 = faces[f * 3];
    const i1 = faces[f * 3 + 1];
    const i2 = faces[f * 3 + 2];
    if (i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount) {
      droppedFaces++;
      continue;
    }
    faceValid[f] = 1;
    const e1x = positions[i1 * 3] - positions[i0 * 3];
    const e1y = positions[i1 * 3 + 1] - positions[i0 * 3 + 1];
    const e1z = positions[i1 * 3 + 2] - positions[i0 * 3 + 2];
    const e2x = positions[i2 * 3] - positions[i0 * 3];
    const e2y = positions[i2 * 3 + 1] - positions[i0 * 3 + 1];
    const e2z = positions[i2 * 3 + 2] - positions[i0 * 3 + 2];
    faceNormals[f * 3] = e1y * e2z - e1z * e2y;
    faceNormals[f * 3 + 1] = e1z * e2x - e1x * e2z;
    faceNormals[f * 3 + 2] = e1x * e2y - e1y * e2x;
    incidentFaces[i0].push(f);
    incidentFaces[i1].push(f);
    incidentFaces[i2].push(f);
  }
  if (droppedFaces > 0) {
    // Drop, not Recover: the offending faces are omitted entirely (the mesh keeps its valid faces), so
    // this mirrors obj.position-index-out-of-range / md2.triangle-vertex-index-out-of-range — the dropped
    // face is the element the crumb names, not the surviving mesh.
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Drop, '3ds.face-index-out-of-range', '', {
      firstDroppedFaces: droppedFaces,
      firstName: mesh.name,
      firstVertexCount: vertexCount,
    });
  }

  const smoothing = mesh.smoothingGroups;

  // Output vertex buffer, grown lazily. Each source vertex keeps its original output index for its first
  // resolved normal, so a mesh with no hard edges reindexes identically to the source; a vertex needing a
  // second (differently-smoothed) normal appends a split copy. `vertexSlots[v]` lists (normal, outIndex).
  const outVertices: number[] = [];
  const vertexSlots: { nx: number; ny: number; nz: number; outIndex: number }[][] = Array.from(
    { length: vertexCount },
    () => [],
  );

  const emitCorner = (face: number, vertex: number): number => {
    // Sum the area-weighted normals of every face sharing this vertex that smooths with `face` (always
    // itself; others only where a smoothing bit overlaps, or unconditionally when no smoothing chunk).
    let nx = 0;
    let ny = 0;
    let nz = 0;
    const incident = incidentFaces[vertex];
    for (let k = 0; k < incident.length; k++) {
      const other = incident[k];
      if (other === face || smoothing === null || (smoothing[face] & smoothing[other]) !== 0) {
        nx += faceNormals[other * 3];
        ny += faceNormals[other * 3 + 1];
        nz += faceNormals[other * 3 + 2];
      }
    }
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }
    const slots = vertexSlots[vertex];
    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s];
      if (Math.abs(slot.nx - nx) < 1e-6 && Math.abs(slot.ny - ny) < 1e-6 && Math.abs(slot.nz - nz) < 1e-6) {
        return slot.outIndex;
      }
    }
    const outIndex = outVertices.length / CANONICAL_FLOATS_PER_VERTEX;
    outVertices.push(positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]);
    outVertices.push(nx, ny, nz);
    outVertices.push(0, 0, 0, 0); // tangent — 3DS carries none
    if (mesh.uvs !== null && vertex < mesh.uvs.length / 2) {
      outVertices.push(mesh.uvs[vertex * 2], 1 - mesh.uvs[vertex * 2 + 1]);
    } else {
      outVertices.push(0, 0);
    }
    slots.push({ nx, ny, nz, outIndex });
    return outIndex;
  };

  // Map each face to the ordinal of the last material group that claims it (-1 = unassigned). Then emit
  // faces grouped by material so each material's triangles form one contiguous MeshSubset range.
  const faceGroup = new Int32Array(faceCount).fill(-1);
  mesh.materialGroups.forEach((group, groupIndex) => {
    for (let i = 0; i < group.faces.length; i++) faceGroup[group.faces[i]] = groupIndex;
  });

  const indices: number[] = [];
  const subsets: MeshSubset[] = [];
  const meshMaterials: number[] = [];
  const emitSubset = (predicate: (face: number) => boolean, materialIndex: number): void => {
    const indexOffset = indices.length;
    for (let f = 0; f < faceCount; f++) {
      if (!faceValid[f] || !predicate(f)) continue;
      indices.push(emitCorner(f, faces[f * 3]), emitCorner(f, faces[f * 3 + 1]), emitCorner(f, faces[f * 3 + 2]));
    }
    const indexCount = indices.length - indexOffset;
    if (indexCount > 0) {
      subsets.push({ indexCount, indexOffset });
      meshMaterials.push(materialIndex);
    }
  };

  mesh.materialGroups.forEach((group, groupIndex) => {
    emitSubset(
      (f) => faceGroup[f] === groupIndex,
      resolveThreeDsMaterial(group.name, materials, materialIndexByName, document, threeDsDrops),
    );
  });
  emitSubset((f) => faceGroup[f] === -1, -1);

  if (subsets.length === 0) return; // every face was dropped as malformed

  const geometry = createMeshGeometry({
    indices: Uint32Array.from(indices),
    layout: CANONICAL_LAYOUT,
    subsets,
    vertices: new Float32Array(outVertices),
  });

  const documentMesh: Scene3DDocumentMesh = { geometry, materials: meshMaterials };
  const meshIndex = document.meshes.length;
  document.meshes.push(documentMesh);
  // A 3DS named object holds a single trimesh, so the name belongs on the Mesh node itself. Match glTF:
  // a lone mesh is a bare Mesh node, named.
  const node: Scene3DDocumentNode = { children: [], kind: MeshKind, mesh: meshIndex, transform };
  if (mesh.name.length > 0) node.name = mesh.name;
  const nodeIndex = document.nodes.length;
  document.nodes.push(node);
  document.scenes[0].rootNodes.push(nodeIndex);
}

// Appends one parsed 3DS camera to the document's camera placement table. The file states a position and
// an aim TARGET POINT; the document wants an orientation, so the aim is derived as the normalized
// target−position and baked into `transform.rotation` as the rotation carrying the canonical camera
// forward axis (-Z) onto it, with the file's bank angle applied as a roll about that same aim.
//
// The lens is a focal length in millimetres, not an angle. It converts to a HORIZONTAL field of view
// against the 35mm gate the format meters against (see THREE_DS_CAMERA_APERTURE_MM); with no aspect ratio
// anywhere in the format, the camera is emitted at aspect 1, where the horizontal and vertical fields of
// view coincide — the same shape glTF lands on for a camera whose `aspectRatio` is absent.
function appendThreeDsCameraDocument(camera: Readonly<ThreeDsCamera>, document: Scene3DDocument): void {
  const position = convertThreeDsPointZUpToYUp(camera.position);
  const transform = createTransform3D();
  transform.position.x = position.x;
  transform.position.y = position.y;
  transform.position.z = position.z;

  const aim = convertThreeDsPointZUpToYUp(camera.target);
  subtractVector3(aim, aim, position);
  if (normalizeVector3(aim, aim) > 0) {
    setQuaternionFromUnitVectors(transform.rotation, DOCUMENT_VIEW_LOCAL_AXIS, aim);
    if (camera.roll !== 0) {
      // The bank angle turns the camera about the axis it is already aiming down, so the roll composes
      // AFTER the aim: rotating about `aim` in world terms is a left-multiply onto the aim rotation.
      const roll = createQuaternion();
      setQuaternionFromAxisAngle(roll, aim, camera.roll * DEG_TO_RAD);
      multiplyQuaternion(transform.rotation, roll, transform.rotation);
    }
  }

  // A lens of zero (or a nonsensical negative) states no usable angle; fall back to the format's own
  // default 50mm lens rather than emitting a degenerate projection.
  const focalLength = camera.focalLength > 0 ? camera.focalLength : THREE_DS_DEFAULT_FOCAL_LENGTH_MM;

  document.cameras.push({
    // CAM_RANGES is optional. When it is absent the clip planes are 3DS's own camera defaults, not
    // invented ones, so an imported camera frames the same depth span the authoring tool showed.
    far: camera.far ?? THREE_DS_DEFAULT_FAR,
    ...(camera.name.length > 0 ? { name: camera.name } : {}),
    near: camera.near ?? THREE_DS_DEFAULT_NEAR,
    projection: {
      aspect: 1,
      fovY: 2 * Math.atan(THREE_DS_CAMERA_APERTURE_MM / (2 * focalLength)),
      kind: 'perspective',
    },
    transform,
  });
}

// Appends one parsed 3DS light to the document's light placement table. A light carrying the spot
// sub-chunk becomes a SpotLight aimed at its target point; every other light is a PointLight, which is
// what the format's own default is. Per the document convention (see Scene3DDocumentLight) the descriptor
// is authored in the light's OWN LOCAL space — position at the origin, aim down -Z — and `transform`
// carries the placement and orientation read from the file.
function appendThreeDsLightDocument(
  light: Readonly<ThreeDsLight>,
  document: Scene3DDocument,
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): void {
  const position = convertThreeDsPointZUpToYUp(light.position);
  const transform = createTransform3D();
  transform.position.x = position.x;
  transform.position.y = position.y;
  transform.position.z = position.z;

  const color = packThreeDsColor(light.color);
  // 3DS states a distance at which attenuation BEGINS (inner) and one at which the light stops (outer).
  // Flight carries the single cutoff, so the outer maps and the inner has nowhere to go.
  const range = light.outerRange ?? -1;
  if (light.innerRange !== null) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Skip, '3ds.light-inner-range-dropped', '', {
      firstName: light.name,
    });
  }

  // A light the author switched off is still an authored light; it imports with its placement and cone
  // intact at zero intensity, so re-enabling it is a single field write rather than a re-import.
  const intensity = light.enabled ? light.multiplier : 0;
  if (!light.enabled) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Skip, '3ds.light-disabled', '', {
      firstName: light.name,
    });
  }

  let descriptor: Light;
  if (light.target !== null) {
    const aim = convertThreeDsPointZUpToYUp(light.target);
    subtractVector3(aim, aim, position);
    if (normalizeVector3(aim, aim) > 0) {
      setQuaternionFromUnitVectors(transform.rotation, DOCUMENT_VIEW_LOCAL_AXIS, aim);
    }
    descriptor = createSpotLight({
      color,
      direction: DOCUMENT_VIEW_LOCAL_AXIS,
      // 3DS states the hotspot and falloff as FULL cone apertures; Flight's cone is described by its
      // half-angles, so each is halved rather than passed through.
      innerConeDegrees: light.hotspot / 2,
      intensity,
      outerConeDegrees: light.falloff / 2,
      range,
    });
  } else {
    descriptor = createPointLight({ color, intensity, range });
  }

  document.lights.push({
    descriptor,
    ...(light.name.length > 0 ? { name: light.name } : {}),
    transform,
  });
}

// Walks the keyframer chunk (0xB000) for object-node PIVOTS ONLY, keyed by node name, and returns them in
// the file's own Z-up space. Empty when the file carries no keyframer.
//
// The keyframer also encodes the node hierarchy and TCB animation tracks, and this deliberately reads
// NEITHER. The hierarchy value in a node header has two documented readings that disagree on edge cases,
// and no file in the reference corpus carries a keyframer to disambiguate them; rotation tracks are
// incremental axis-angle with variable-length per-key spline parameters. A wrong hierarchy would visibly
// misplace geometry that currently renders correctly, so the ambiguous parts stay unread and are recorded
// in agents/scene3d-format-coverage.md. The pivot has neither problem: three float32, unambiguous, and
// applying it is render-neutral by construction (see localizeThreeDsPositions).
function collectThreeDsPivots(
  view: Readonly<DataView>,
  offset: number,
): Map<string, readonly [number, number, number]> {
  const pivots = new Map<string, readonly [number, number, number]>();
  const end = Math.min(offset + readChunkLength(view, offset), view.byteLength);
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;

  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) break;

    if (chunkId === THREE_DS_MAIN) {
      for (const [name, pivot] of collectThreeDsPivots(view, cursor)) pivots.set(name, pivot);
    } else if (chunkId === THREE_DS_KEYFRAME) {
      collectThreeDsNodePivots(view, cursor, chunkEnd, pivots);
    }

    cursor = chunkEnd;
  }

  return pivots;
}

// Walks the node tags inside a keyframer chunk, pairing each node's header name with its pivot.
function collectThreeDsNodePivots(
  view: Readonly<DataView>,
  offset: number,
  end: number,
  pivots: Map<string, readonly [number, number, number]>,
): void {
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) return;

    if (chunkId === THREE_DS_KEYFRAME_OBJECT_NODE) {
      let name: string | null = null;
      let pivot: readonly [number, number, number] | null = null;
      let inner = cursor + THREE_DS_CHUNK_HEADER_BYTES;
      while (inner + THREE_DS_CHUNK_HEADER_BYTES <= chunkEnd) {
        const innerId = view.getUint16(inner, true);
        const innerEnd = readChunkEnd(view, inner, chunkEnd);
        if (innerEnd < 0) break;
        const dataStart = inner + THREE_DS_CHUNK_HEADER_BYTES;

        if (innerId === THREE_DS_KEYFRAME_NODE_HEADER) {
          // The header is a NUL-terminated name followed by two flag uint16s and the hierarchy value.
          // Only the name is read — see collectThreeDsPivots for why the hierarchy is not.
          name = readNullTerminatedString(view, dataStart, innerEnd);
        } else if (innerId === THREE_DS_KEYFRAME_PIVOT && dataStart + 12 <= innerEnd) {
          pivot = [
            view.getFloat32(dataStart, true),
            view.getFloat32(dataStart + 4, true),
            view.getFloat32(dataStart + 8, true),
          ];
        }

        inner = innerEnd;
      }
      // A zero pivot is the format's default and means the node origin already is the object origin, so
      // recording it would only cost a needless translate compose downstream.
      if (name !== null && name.length > 0 && pivot !== null && (pivot[0] !== 0 || pivot[1] !== 0 || pivot[2] !== 0)) {
        pivots.set(name, pivot);
      }
    }

    cursor = chunkEnd;
  }
}

// Rewrites `positions` (world-space, Z-up, in place) into the model space TRI_LOCAL placed them from,
// and writes that placement into `out` as a Y-up Transform3D. Both steps read the same matrix:
//
//   world_zup = M_zup * local_zup           the file's own relation
//   local_zup = inverse(M_zup) * world_zup  what this recovers
//   M_yup     = C * M_zup * transpose(C)    the placement, re-expressed in Y-up
//
// where C is the Z-up→Y-up rotation. Conjugating rather than merely rotating is what keeps the pair
// consistent: re-applying the Y-up placement to the Y-up-converted local vertices reproduces exactly the
// Y-up-converted world vertices, so the change is invisible to a static render and only shows up once
// something drives the transform.
//
// A singular matrix has no inverse — the geometry is left in world space and the node keeps its identity
// transform, which is the pre-TRI_LOCAL behavior and still renders correctly. Returns whether the
// localization actually ran, because a caller correcting for a mirrored placement must not correct for
// one that was never applied.
function localizeThreeDsPositions(
  positions: number[],
  localMatrix: Readonly<Float32Array>,
  pivot: readonly [number, number, number] | null,
  out: Transform3D,
  name: string,
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): boolean {
  // The file's four contiguous 3-vectors are exactly Matrix4's four columns (m[column * 4 + row]), so the
  // twelve floats copy straight into the basis and translation slots with no transpose.
  const placement = createMatrix4(
    localMatrix[0],
    localMatrix[1],
    localMatrix[2],
    0,
    localMatrix[3],
    localMatrix[4],
    localMatrix[5],
    0,
    localMatrix[6],
    localMatrix[7],
    localMatrix[8],
    0,
    localMatrix[9],
    localMatrix[10],
    localMatrix[11],
    1,
  );

  const inverse = createMatrix4();
  if (!inverseMatrix4(inverse, placement)) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Recover, '3ds.local-matrix-singular', '', {
      firstName: name,
    });
    return false;
  }

  const point = createVector3(0, 0, 0);
  for (let i = 0; i + 2 < positions.length; i += 3) {
    point.x = positions[i];
    point.y = positions[i + 1];
    point.z = positions[i + 2];
    matrix4TransformPoint(point, inverse, point);
    positions[i] = point.x;
    positions[i + 1] = point.y;
    positions[i + 2] = point.z;
  }

  // The keyframer's pivot is the origin the node rotates and scales about, expressed in this same model
  // space. Moving it to the node origin means subtracting it from the geometry and composing the opposite
  // translation into the placement — which is again render-neutral (subtract, then re-add) and shows up
  // only once something drives the transform, exactly like the localization above.
  if (pivot !== null) {
    for (let i = 0; i + 2 < positions.length; i += 3) {
      positions[i] -= pivot[0];
      positions[i + 1] -= pivot[1];
      positions[i + 2] -= pivot[2];
    }
    const pivotTranslation = createMatrix4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, pivot[0], pivot[1], pivot[2], 1);
    multiplyMatrix4(placement, placement, pivotTranslation);
  }

  const conjugated = createMatrix4();
  multiplyMatrix4(conjugated, THREE_DS_Z_UP_TO_Y_UP, placement);
  multiplyMatrix4(conjugated, conjugated, THREE_DS_Y_UP_TO_Z_UP);
  decomposeMatrix4ToTransform3D(out, conjugated);
  return true;
}

// Returns a copy of the face index array with every triangle's winding reversed (second and third
// corners swapped). A copy rather than an in-place edit because the parsed mesh is shared with the
// caller's own view of the file, and canonicalization is this emitter's decision, not a rewrite of what
// was parsed.
function reverseThreeDsFaceWinding(faces: Readonly<Uint16Array>): Uint16Array {
  const reversed = new Uint16Array(faces.length);
  reversed.set(faces);
  for (let f = 0; f + 2 < reversed.length; f += 3) {
    const swap = reversed[f + 1];
    reversed[f + 1] = reversed[f + 2];
    reversed[f + 2] = swap;
  }
  return reversed;
}

// Determinant of TRI_LOCAL's upper 3x3. The file stores the placement as four contiguous 3-vectors, so
// the first three ARE the basis columns. A negative value means the placement mirrors: localizing by its
// inverse turns the geometry inside out relative to the winding the file authored in world space.
function threeDsLocalMatrixDeterminant(localMatrix: Readonly<Float32Array>): number {
  return (
    localMatrix[0] * (localMatrix[4] * localMatrix[8] - localMatrix[5] * localMatrix[7]) -
    localMatrix[3] * (localMatrix[1] * localMatrix[8] - localMatrix[2] * localMatrix[7]) +
    localMatrix[6] * (localMatrix[1] * localMatrix[5] - localMatrix[2] * localMatrix[4])
  );
}

// Applies the RH Z-up → RH Y-up conversion to a single point, so a light or camera placement enters the
// document through the same seam as every mesh vertex (see convertPositionsZUpToYUp).
function convertThreeDsPointZUpToYUp(point: readonly [number, number, number]): Vector3 {
  const values = [point[0], point[1], point[2]];
  convertPositionsZUpToYUp(values);
  return createVector3(values[0], values[1], values[2]);
}

// Resolves a 3DS material name to its document material index, registering it (converted to BlinnPhong)
// on first use and memoizing in `materialIndexByName` so a material shared across meshes registers once.
// Returns -1 for an empty name or a name absent from the file's material table (a default-material subset).
function resolveThreeDsMaterial(
  name: string,
  materials: Readonly<Map<string, ThreeDsMaterial>>,
  materialIndexByName: Map<string, number>,
  document: Scene3DDocument,
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): number {
  if (name.length === 0) return -1; // an empty name is a spec-valid default-material subset — silent
  const parsed = materials.get(name);
  if (parsed === undefined) {
    // A FACE_MATERIAL group naming a material absent from the file's table: the authored binding is dropped
    // and the subset falls back to the default material — mirrors obj.material-missing (Drop).
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Drop, '3ds.material-missing', '', { firstName: name });
    return -1;
  }
  const cached = materialIndexByName.get(name);
  if (cached !== undefined) return cached;
  const index = document.materials.length;
  document.materials.push(threeDsMaterialToBlinnPhong(parsed, document) as unknown as MaterialLike);
  materialIndexByName.set(name, index);
  return index;
}

// Converts a parsed 3DS material to Flight's BlinnPhongMaterial — 3DS's own diffuse/specular shading
// model. Diffuse and specular colors map directly; shininess maps to the specular exponent; the diffuse
// texture filename becomes an Unresolved External diffuseMap ref (the bump filename stays parsed
// metadata — see the NOTE below); and a below-opaque
// material folds its opacity into the diffuse alpha plus a blend alphaMode. The ambient color has no
// Blinn-Phong equivalent (ambient is a scene light in Flight), so it is dropped; a caller wanting PBR
// converts explicitly.
function threeDsMaterialToBlinnPhong(material: Readonly<ThreeDsMaterial>, document: Scene3DDocument): Material {
  const result = createBlinnPhongMaterial({
    // MAT_OPACMAP is a dedicated coverage image, separate from the diffuse map's own alpha. Flight's
    // alphaMap reads its GREEN channel, which is what a grayscale opacity image carries in every channel.
    alphaMap:
      material.opacityFilename !== null
        ? createExternalTextureRef(material.opacityFilename, null, document.resources)
        : null,
    diffuse: packThreeDsColor(material.diffuse, material.opacity),
    diffuseMap:
      material.textureFilename !== null
        ? createExternalTextureRef(material.textureFilename, null, document.resources)
        : null,
    specular: packThreeDsColor(material.specular),
    // shininess is nullable so an explicit MAT_SHININESS of 0 (a valid, matte value) is passed through
    // rather than dropped to createBlinnPhongMaterial's non-zero default; absent stays absent.
    ...(material.shininess !== null ? { shininess: material.shininess } : {}),
  });
  // NOTE: MAT_BUMPMAP (0xA230) is a legacy grayscale HEIGHT map, not a tangent-space normal map — binding
  // it to `normalMap` (which the shaders sample as RGB*2-1 normals) would render bogus vectors. It is
  // parsed into `material.bumpFilename` as metadata but intentionally NOT bound here; an honest bump→normal
  // seam is a renderer feature (see scene-formats status.md, parked alongside the opacity map).
  // Preserve the 3DS material chunk name as the material's authored name (empty → anonymous).
  result.name = material.name.length > 0 ? material.name : null;
  // A material below full opacity blends: the opacity rode into the diffuse alpha above; the blend
  // alphaMode makes the renderer actually blend rather than treat the alpha as coverage.
  // An alphaMap is INERT while alphaMode is 'opaque', so a material carrying one blends even when its
  // scalar transparency says fully opaque — otherwise the authored coverage image would silently do
  // nothing. The scalar and the map multiply, so a material stating both keeps both.
  if (material.opacity < 1 || material.opacityFilename !== null) result.alphaMode = 'blend';
  return result as unknown as Material;
}

// Parses a material block (0xAFFF): walks sub-chunks for the name, the diffuse/specular/ambient color
// blocks, the shininess and transparency percentages, and the diffuse and bump texture-map filenames.
function parseMaterial(view: Readonly<DataView>, offset: number, end: number): ThreeDsMaterial {
  let name = '';
  let ambient: readonly [number, number, number] = [0, 0, 0];
  let bumpFilename: string | null = null;
  let diffuse: readonly [number, number, number] = [1, 1, 1];
  let opacity = 1;
  let opacityFilename: string | null = null;
  // null = absent (use the material default); a parsed value (including an explicit 0) is passed through.
  let shininess: number | null = null;
  let specular: readonly [number, number, number] = [1, 1, 1];
  let textureFilename: string | null = null;

  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) break;
    const dataStart = cursor + THREE_DS_CHUNK_HEADER_BYTES;

    if (chunkId === THREE_DS_MATERIAL_NAME) {
      name = readNullTerminatedString(view, dataStart, chunkEnd);
    } else if (chunkId === THREE_DS_MATERIAL_AMBIENT) {
      ambient = parseColorChunk(view, dataStart, chunkEnd) ?? ambient;
    } else if (chunkId === THREE_DS_MATERIAL_DIFFUSE) {
      diffuse = parseColorChunk(view, dataStart, chunkEnd) ?? diffuse;
    } else if (chunkId === THREE_DS_MATERIAL_SPECULAR) {
      specular = parseColorChunk(view, dataStart, chunkEnd) ?? specular;
    } else if (chunkId === THREE_DS_MATERIAL_SHININESS) {
      // The MAT_SHININESS percentage (0..1) maps to a Blinn-Phong specular exponent; 100% → 128, a
      // conventional maximum. 3DS's shininess slider has no exact Phong-exponent equivalent.
      const fraction = parsePercentageChunk(view, dataStart, chunkEnd);
      if (fraction !== null) shininess = fraction * 128;
    } else if (chunkId === THREE_DS_MATERIAL_TRANSPARENCY) {
      // MAT_TRANSPARENCY is the transparent fraction (0 = opaque); opacity is its complement.
      const fraction = parsePercentageChunk(view, dataStart, chunkEnd);
      if (fraction !== null) opacity = 1 - fraction;
    } else if (chunkId === THREE_DS_MATERIAL_TEXTURE_MAP) {
      textureFilename = parseTextureFilename(view, dataStart, chunkEnd);
    } else if (chunkId === THREE_DS_MATERIAL_BUMP_MAP) {
      bumpFilename = parseTextureFilename(view, dataStart, chunkEnd);
    } else if (chunkId === THREE_DS_MATERIAL_OPACITY_MAP) {
      opacityFilename = parseTextureFilename(view, dataStart, chunkEnd);
    }

    cursor = chunkEnd;
  }

  return { ambient, bumpFilename, diffuse, name, opacity, opacityFilename, shininess, specular, textureFilename };
}

// Reads the nested color sub-chunk of a material color block: COLOR_FLOAT (0x0010, 3 float32 in [0,1])
// or COLOR_BYTE (0x0011, 3 uint8 in [0,255], normalized). Returns [r,g,b] in [0,1], or null if absent.
function parseColorChunk(
  view: Readonly<DataView>,
  offset: number,
  end: number,
): readonly [number, number, number] | null {
  let cursor = offset;
  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) break;
    const dataStart = cursor + THREE_DS_CHUNK_HEADER_BYTES;

    if (chunkId === THREE_DS_COLOR_FLOAT && dataStart + 12 <= chunkEnd) {
      return [
        view.getFloat32(dataStart, true),
        view.getFloat32(dataStart + 4, true),
        view.getFloat32(dataStart + 8, true),
      ];
    }
    if (chunkId === THREE_DS_COLOR_BYTE && dataStart + 3 <= chunkEnd) {
      return [view.getUint8(dataStart) / 255, view.getUint8(dataStart + 1) / 255, view.getUint8(dataStart + 2) / 255];
    }

    cursor = chunkEnd;
  }
  return null;
}

// Reads a percentage material sub-chunk (shininess/transparency), returning a fraction in [0,1]: an
// INT_PERCENTAGE (0x0030) uint16 in [0,100] is divided by 100; a FLOAT_PERCENTAGE (0x0031) float32 is a
// fraction already. Returns null if neither is present.
function parsePercentageChunk(view: Readonly<DataView>, offset: number, end: number): number | null {
  let cursor = offset;
  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) break;
    const dataStart = cursor + THREE_DS_CHUNK_HEADER_BYTES;

    if (chunkId === THREE_DS_PERCENT_INT && dataStart + 2 <= chunkEnd) {
      return Math.min(1, Math.max(0, view.getUint16(dataStart, true) / 100));
    }
    if (chunkId === THREE_DS_PERCENT_FLOAT && dataStart + 4 <= chunkEnd) {
      return Math.min(1, Math.max(0, view.getFloat32(dataStart, true)));
    }

    cursor = chunkEnd;
  }
  return null;
}

// Reads a texture map block (0xA200 diffuse, 0xA230 bump, …), returning its filename sub-chunk (0xA300)
// or null.
function parseTextureFilename(view: Readonly<DataView>, offset: number, end: number): string | null {
  let cursor = offset;
  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) break;
    if (chunkId === THREE_DS_MATERIAL_TEXTURE_FILENAME) {
      const name = readNullTerminatedString(view, cursor + THREE_DS_CHUNK_HEADER_BYTES, chunkEnd);
      return name.length > 0 ? name : null;
    }
    cursor = chunkEnd;
  }
  return null;
}

// Packs a 3DS sRGB-space [r,g,b] triple plus an alpha (each in [0,1]) into a 0xRRGGBBAA integer.
function packThreeDsColor(rgb: readonly [number, number, number], alpha = 1): number {
  const r = Math.round(Math.min(1, Math.max(0, rgb[0])) * 0xff);
  const g = Math.round(Math.min(1, Math.max(0, rgb[1])) * 0xff);
  const b = Math.round(Math.min(1, Math.max(0, rgb[2])) * 0xff);
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 0xff);
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

// Reads a null-terminated ASCII string starting at `offset`, stopping at the first null byte or at
// `end` (whichever comes first).
function readNullTerminatedString(view: Readonly<DataView>, offset: number, end: number): string {
  const chars: string[] = [];
  let cursor = offset;
  while (cursor < end) {
    const byte = view.getUint8(cursor);
    if (byte === 0) break;
    chars.push(String.fromCharCode(byte));
    cursor++;
  }
  return chars.join('');
}

// Reads the chunk length (uint32 at offset + 2). The length includes the 6-byte header.
// Resolves the end of the chunk whose header starts at `cursor`, or -1 when that chunk cannot be
// walked: a declared length shorter than the header itself, or one that overruns the enclosing region.
//
// The short-length half is what makes a walk TERMINATE. Every chunk loop in this file advances by
// `cursor = chunkEnd`, so a declared length of 0 puts the end back at the cursor and the loop spins
// forever — and the trigger is not adversarial, it is zero padding inside a parent whose declared
// length still covers it. Bounding the advance here, at the one place every walk derives it, is what
// makes a non-terminating walk unrepresentable rather than an invariant eight loops must each
// remember; five of them did and three did not.
function readChunkEnd(view: Readonly<DataView>, cursor: number, end: number): number {
  const chunkLength = readChunkLength(view, cursor);
  if (chunkLength < THREE_DS_CHUNK_HEADER_BYTES) return -1;
  const chunkEnd = cursor + chunkLength;
  return chunkEnd > end ? -1 : chunkEnd;
}

function readChunkLength(view: Readonly<DataView>, offset: number): number {
  return view.getUint32(offset + 2, true);
}

// One accumulated 3DS chunk-level drop: a total occurrence `count` plus the first offender's `detail`,
// keyed by kind + discriminator. No origin is stored — the tallies are flushed (physically reported) by
// parse3ds, so it is every aggregated crumb's origin per the collector's emitting-function contract;
// `kind` carries the drop-site granularity.
interface ThreeDsDropTally {
  count: number;
  detail: Record<string, boolean | number | string>;
  kind: string;
  severity: ImportDiagnosticSeverity;
}

// The canonical local forward axis every placed document light and camera is authored against: -Z, with
// the entity's own `transform` supplying the orientation (see Scene3DDocumentLight). Read-only —
// createSpotLight clones the direction it is given, and setQuaternionFromUnitVectors only reads its `from`.
const DOCUMENT_VIEW_LOCAL_AXIS = createVector3(0, 0, -1);

// The RH Z-up → RH Y-up rotation as a Matrix4, and its inverse. This is convertPositionsZUpToYUp's
// -90°-about-X, (x, y, z) → (x, z, -y), in the form a placement matrix can be conjugated by; the columns
// are the images of the basis vectors. Being a rotation, the inverse is the transpose. Read-only.
const THREE_DS_Z_UP_TO_Y_UP = createMatrix4(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
const THREE_DS_Y_UP_TO_Z_UP = createMatrix4(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);

// 3DS's own camera defaults, used only when the file omits the chunk that would state them: the stock
// 50mm lens, and the CAM_RANGES clip span. Importing these rather than invented values keeps a camera
// framing the depth span the authoring tool showed.
const THREE_DS_DEFAULT_FAR = 1000;
const THREE_DS_DEFAULT_FOCAL_LENGTH_MM = 50;
const THREE_DS_DEFAULT_NEAR = 1;

// Records one offender against its (kind, discriminator) tally — the aggregate-once alternative to a
// per-chunk/per-mesh `reportImportDiagnostic` while walking the recursive chunk tree. No-op (never
// allocates) when no collector is engaged. `firstDetail` is kept from the FIRST offender; later ones only
// bump the count. The discriminator is the categorical sub-reason (never an instance name), so faults of
// the same kind across many meshes collapse to one crumb.
function tallyThreeDsDrop(
  tallies: Map<string, ThreeDsDropTally> | null,
  severity: ImportDiagnosticSeverity,
  kind: string,
  discriminator: string,
  firstDetail: Record<string, boolean | number | string>,
): void {
  if (tallies === null) return;
  const key = `${kind}|${discriminator}`;
  const existing = tallies.get(key);
  if (existing === undefined) tallies.set(key, { count: 1, detail: firstDetail, kind, severity });
  else existing.count++;
}
