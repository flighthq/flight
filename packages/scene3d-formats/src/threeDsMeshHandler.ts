import {
  createMatrix4,
  createTransform3D,
  createVector3,
  decomposeMatrix4ToTransform3D,
  inverseMatrix4,
  matrix4TransformPoint,
  multiplyMatrix4,
} from '@flighthq/geometry/contract';
import { createBlinnPhongMaterial } from '@flighthq/materials/contract';
import { createMeshGeometry } from '@flighthq/mesh/contract';
import type {
  Material,
  MaterialLike,
  MeshSubset,
  Scene3DDocument,
  Scene3DDocumentMesh,
  Scene3DDocumentNode,
  ThreeDsChunkHandler,
  ThreeDsDropTally,
  ThreeDsMaterial,
  ThreeDsMaterialGroup,
  ThreeDsMesh,
  ThreeDsParseState,
  Transform3D,
} from '@flighthq/types/contract';
import {
  ImportDiagnosticSeverity,
  MeshKind,
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_FACE_MATERIAL,
  THREE_DS_FACES,
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
} from './shared.ts';
import {
  packThreeDsColor,
  readChunkEnd,
  readChunkLength,
  readNullTerminatedString,
  tallyThreeDsDrop,
} from './threeDsParse.ts';

export const threeDsMeshHandler: Readonly<ThreeDsChunkHandler> = {
  chunkIds: [THREE_DS_TRIMESH],
  build(state: ThreeDsParseState): void {
    const { document, drops, materials, meshes, pivots } = state;
    const materialIndexByName = new Map<string, number>();
    for (let i = 0; i < meshes.length; i++) {
      appendMeshDocument(meshes[i], materials, materialIndexByName, pivots, document, drops);
    }
  },
  collect(state: ThreeDsParseState, view: Readonly<DataView>, offset: number, end: number, name: string): void {
    const mesh = parseThreeDsTrimesh(view, offset, end, name, state.drops);
    if (mesh !== null) state.meshes.push(mesh);
  },
};

export const threeDsMeshFamily: readonly ThreeDsChunkHandler[] = [threeDsMeshHandler];

// Parses a trimesh chunk (0x4100) and its sub-chunks (vertices, faces, UVs) into a ThreeDsMesh
// descriptor.
export function parseThreeDsTrimesh(
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

// The RH Z-up → RH Y-up rotation as a Matrix4, and its inverse. This is convertPositionsZUpToYUp's
// -90°-about-X, (x, y, z) → (x, z, -y), in the form a placement matrix can be conjugated by; the columns
// are the images of the basis vectors. Being a rotation, the inverse is the transpose. Read-only.
const THREE_DS_Z_UP_TO_Y_UP = createMatrix4(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
const THREE_DS_Y_UP_TO_Z_UP = createMatrix4(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
