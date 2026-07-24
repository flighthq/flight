import { createTransform3D } from '@flighthq/geometry';
import { createBlinnPhongMaterial } from '@flighthq/materials';
import { createMeshGeometry } from '@flighthq/mesh';
import { createSceneFromDocument } from '@flighthq/scene';
import type {
  Material,
  MaterialLike,
  MeshSubset,
  Scene,
  SceneDocument,
  SceneDocumentMesh,
  SceneDocumentNode,
  ThreeDsMaterial,
  ThreeDsMaterialGroup,
  ThreeDsMesh,
} from '@flighthq/types';
import { MeshKind } from '@flighthq/types';
import {
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_COLOR_BYTE,
  THREE_DS_COLOR_FLOAT,
  THREE_DS_EDITOR,
  THREE_DS_FACE_MATERIAL,
  THREE_DS_FACES,
  THREE_DS_MAIN,
  THREE_DS_MATERIAL,
  THREE_DS_MATERIAL_AMBIENT,
  THREE_DS_MATERIAL_BUMP_MAP,
  THREE_DS_MATERIAL_DIFFUSE,
  THREE_DS_MATERIAL_NAME,
  THREE_DS_MATERIAL_SHININESS,
  THREE_DS_MATERIAL_SPECULAR,
  THREE_DS_MATERIAL_TEXTURE_FILENAME,
  THREE_DS_MATERIAL_TEXTURE_MAP,
  THREE_DS_MATERIAL_TRANSPARENCY,
  THREE_DS_OBJECT,
  THREE_DS_PERCENT_FLOAT,
  THREE_DS_PERCENT_INT,
  THREE_DS_SMOOTH_GROUP,
  THREE_DS_TRIMESH,
  THREE_DS_UV_COORDS,
  THREE_DS_VERTICES,
} from '@flighthq/types';

import {
  CANONICAL_FLOATS_PER_VERTEX,
  CANONICAL_LAYOUT,
  convertPositionsZUpToYUp,
  createExternalTextureRef,
} from './shared';

// Parses an Autodesk 3DS binary file into a Scene. The 3DS format is a recursive chunk tree
// (little-endian): each chunk has a uint16 ID, a uint32 total length (including the 6-byte header),
// and a payload of sub-chunks and/or inline data. The editor chunk (0x3D3D) contains named objects
// (0x4000), each of which may contain a triangle mesh (0x4100) with vertex, face, and UV sub-chunks.
//
// Each mesh becomes a Mesh scene node with the canonical PBR vertex layout. The 3DS coordinate
// system is right-handed Z-up (like MD2/MD5); positions are converted to Flight's right-handed
// Y-up via convertPositionsZUpToYUp, a -90° rotation about X ((x, y, z) → (x, z, -y), det = +1).
// Because the conversion is a rotation, not a reflection, triangle winding and computed normals
// are preserved as-is from the file — no winding reversal is needed.
//
// The 3DS format limits each mesh to 65535 vertices (uint16 indices). Multiple mesh objects are
// common in practice and each becomes a separate Mesh child of the scene.
//
// Malformed or truncated input pushes a warning and returns an empty or partial scene; the function
// never throws on bad input. Convenience over `createSceneFromDocument(parse3ds(bytes))`.
export function createSceneFrom3ds(bytes: Readonly<Uint8Array>, warnings?: string[]): Scene {
  return createSceneFromDocument(parse3ds(bytes, warnings));
}

// Parses an Autodesk 3DS binary file into a format-neutral SceneDocument. Each named-object trimesh
// becomes one document Mesh node (inline geometry, canonical PBR layout, RH Z-up → Y-up). Referenced
// materials are registered into the document's materials table (deduped by name) and named per mesh by
// index. Assemble into a live Scene with `createSceneFromDocument`. Malformed input returns an empty or
// partial document with a warning.
export function parse3ds(bytes: Readonly<Uint8Array>, warnings?: string[]): SceneDocument {
  const document: SceneDocument = {
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
    warnings?.push('createSceneFrom3ds: input is smaller than the minimum chunk header (6 bytes)');
    return document;
  }

  const source = bytes as Uint8Array;
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);

  const mainId = view.getUint16(0, true);
  if (mainId !== THREE_DS_MAIN) {
    warnings?.push(
      `createSceneFrom3ds: expected main chunk ID 0x4D4D but found 0x${mainId.toString(16).toUpperCase().padStart(4, '0')}`,
    );
    return document;
  }

  // The material table (0xAFFF chunks) and the meshes are siblings under the editor chunk, and a mesh
  // references its materials by name via FACE_MATERIAL — so collect the whole table first, then
  // resolve each mesh's referenced names against it.
  const materials = new Map<string, ThreeDsMaterial>();
  const meshes = collectMeshes(view, 0, materials, warnings);
  const materialIndexByName = new Map<string, number>();
  for (let i = 0; i < meshes.length; i++) {
    appendMeshDocument(meshes[i], materials, materialIndexByName, document, warnings);
  }

  return document;
}

// Recursively walks the chunk tree starting at `offset`, collecting all trimesh descriptors found
// within editor → object → trimesh sub-chunks, and populating `materials` with every material block
// (0xAFFF) found alongside them under the editor chunk.
function collectMeshes(
  view: Readonly<DataView>,
  offset: number,
  materials: Map<string, ThreeDsMaterial>,
  warnings?: string[],
): readonly ThreeDsMesh[] {
  const end = Math.min(offset + readChunkLength(view, offset), view.byteLength);
  const meshes: ThreeDsMesh[] = [];
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;

  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkLength = readChunkLength(view, cursor);
    const chunkEnd = cursor + chunkLength;

    if (chunkEnd > end) {
      warnings?.push(
        `createSceneFrom3ds: chunk 0x${chunkId.toString(16).toUpperCase().padStart(4, '0')} at offset ${cursor} declares length ${chunkLength} which exceeds parent boundary`,
      );
      break;
    }

    if (chunkId === THREE_DS_EDITOR || chunkId === THREE_DS_MAIN) {
      const inner = collectMeshes(view, cursor, materials, warnings);
      for (let i = 0; i < inner.length; i++) meshes.push(inner[i]);
    } else if (chunkId === THREE_DS_OBJECT) {
      const mesh = parseObject(view, cursor, chunkEnd, warnings);
      if (mesh !== null) meshes.push(mesh);
    } else if (chunkId === THREE_DS_MATERIAL) {
      const material = parseMaterial(view, cursor, chunkEnd);
      if (material.name.length > 0) materials.set(material.name, material);
    }

    cursor = chunkEnd;
  }

  return meshes;
}

// Parses a named object chunk (0x4000). The payload starts with a null-terminated ASCII name string,
// followed by sub-chunks. If a trimesh sub-chunk (0x4100) is found, its vertex/face/UV data is
// returned as a ThreeDsMesh.
function parseObject(view: Readonly<DataView>, offset: number, end: number, warnings?: string[]): ThreeDsMesh | null {
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
  const name = readNullTerminatedString(view, cursor, end);
  cursor += name.length + 1; // advance past the name and null terminator

  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkLength = readChunkLength(view, cursor);
    const chunkEnd = cursor + chunkLength;

    if (chunkEnd > end) {
      warnings?.push(`createSceneFrom3ds: trimesh sub-chunk at offset ${cursor} exceeds object boundary`);
      break;
    }

    if (chunkId === THREE_DS_TRIMESH) {
      return parseTrimesh(view, cursor, chunkEnd, name, warnings);
    }

    cursor = chunkEnd;
  }

  return null;
}

// Parses a trimesh chunk (0x4100) and its sub-chunks (vertices, faces, UVs) into a ThreeDsMesh
// descriptor.
function parseTrimesh(
  view: Readonly<DataView>,
  offset: number,
  end: number,
  name: string,
  warnings?: string[],
): ThreeDsMesh | null {
  let vertices: Float32Array | null = null;
  let faces: Uint16Array | null = null;
  let uvs: Float32Array | null = null;
  let materialGroups: readonly ThreeDsMaterialGroup[] = [];
  let smoothingGroups: Uint32Array | null = null;

  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;

  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkLength = readChunkLength(view, cursor);
    const chunkEnd = cursor + chunkLength;

    if (chunkEnd > end) {
      warnings?.push(
        `createSceneFrom3ds: sub-chunk 0x${chunkId.toString(16).toUpperCase().padStart(4, '0')} in mesh '${name}' exceeds trimesh boundary`,
      );
      break;
    }

    const dataStart = cursor + THREE_DS_CHUNK_HEADER_BYTES;

    if (chunkId === THREE_DS_VERTICES) {
      vertices = parseVertices(view, dataStart, chunkEnd, warnings);
    } else if (chunkId === THREE_DS_FACES) {
      const parsed = parseFaces(view, dataStart, chunkEnd, warnings);
      if (parsed !== null) {
        faces = parsed.faces;
        materialGroups = parsed.materialGroups;
        smoothingGroups = parsed.smoothingGroups;
      }
    } else if (chunkId === THREE_DS_UV_COORDS) {
      uvs = parseUvCoords(view, dataStart, chunkEnd, warnings);
    }

    cursor = chunkEnd;
  }

  if (vertices === null || faces === null) {
    warnings?.push(
      `createSceneFrom3ds: mesh '${name}' is missing ${vertices === null ? 'vertices' : 'faces'}; skipping`,
    );
    return null;
  }

  return { faces, materialGroups, name, smoothingGroups, uvs, vertices };
}

// Reads the vertex list sub-chunk (0x4110): uint16 count followed by count * 3 float32 values
// (x, y, z per vertex).
function parseVertices(
  view: Readonly<DataView>,
  dataStart: number,
  end: number,
  warnings?: string[],
): Float32Array | null {
  if (dataStart + 2 > end) {
    warnings?.push('createSceneFrom3ds: vertex sub-chunk too small to read count');
    return null;
  }
  const count = view.getUint16(dataStart, true);
  const floatsNeeded = count * 3;
  const bytesNeeded = dataStart + 2 + floatsNeeded * 4;
  if (bytesNeeded > end) {
    warnings?.push(`createSceneFrom3ds: vertex sub-chunk declares ${count} vertices but data is truncated`);
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
  warnings?: string[],
): { faces: Uint16Array; materialGroups: readonly ThreeDsMaterialGroup[]; smoothingGroups: Uint32Array | null } | null {
  if (dataStart + 2 > end) {
    warnings?.push('createSceneFrom3ds: face sub-chunk too small to read count');
    return null;
  }
  const count = view.getUint16(dataStart, true);
  const facesEnd = dataStart + 2 + count * 4 * 2;
  if (facesEnd > end) {
    warnings?.push(`createSceneFrom3ds: face sub-chunk declares ${count} faces but data is truncated`);
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
    if (subLength < THREE_DS_CHUNK_HEADER_BYTES || subEnd > end) break;
    const dataOffset = cursor + THREE_DS_CHUNK_HEADER_BYTES;
    if (subId === THREE_DS_FACE_MATERIAL) {
      const group = parseFaceMaterialGroup(view, dataOffset, subEnd, count, warnings);
      if (group !== null) materialGroups.push(group);
    } else if (subId === THREE_DS_SMOOTH_GROUP) {
      smoothingGroups = parseSmoothingGroups(view, dataOffset, subEnd, count, warnings);
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
  warnings?: string[],
): ThreeDsMaterialGroup | null {
  const name = readNullTerminatedString(view, dataStart, end);
  if (name.length === 0) return null;
  let offset = dataStart + name.length + 1; // past the name and null terminator
  if (offset + 2 > end) {
    warnings?.push(`createSceneFrom3ds: material group '${name}' is missing its face-index count`);
    return null;
  }
  const groupFaceCount = view.getUint16(offset, true);
  offset += 2;
  if (offset + groupFaceCount * 2 > end) {
    warnings?.push(
      `createSceneFrom3ds: material group '${name}' declares ${groupFaceCount} faces but data is truncated`,
    );
    return null;
  }
  const faces = new Uint16Array(groupFaceCount);
  let kept = 0;
  for (let i = 0; i < groupFaceCount; i++) {
    const faceIndex = view.getUint16(offset + i * 2, true);
    if (faceIndex < faceCount) faces[kept++] = faceIndex;
  }
  if (kept < groupFaceCount) {
    warnings?.push(
      `createSceneFrom3ds: material group '${name}' references face indices past the mesh's ${faceCount} faces`,
    );
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
  warnings?: string[],
): Uint32Array | null {
  if (dataStart + faceCount * 4 > end) {
    warnings?.push(`createSceneFrom3ds: smoothing-group sub-chunk declares fewer than ${faceCount} masks; ignoring`);
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
  warnings?: string[],
): Float32Array | null {
  if (dataStart + 2 > end) {
    warnings?.push('createSceneFrom3ds: UV sub-chunk too small to read count');
    return null;
  }
  const count = view.getUint16(dataStart, true);
  const floatsNeeded = count * 2;
  const bytesNeeded = dataStart + 2 + floatsNeeded * 4;
  if (bytesNeeded > end) {
    warnings?.push(`createSceneFrom3ds: UV sub-chunk declares ${count} entries but data is truncated`);
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
  document: SceneDocument,
  warnings?: string[],
): void {
  const vertexCount = mesh.vertices.length / 3;
  const faceCount = mesh.faces.length / 3;

  if (vertexCount === 0 || faceCount === 0) return;

  // Convert positions from RH Z-up to RH Y-up before normal computation so all geometry operates in
  // Flight's coordinate space. The rotation preserves winding, so computed normals face outward.
  const positions = Array.from(mesh.vertices);
  convertPositionsZUpToYUp(positions);

  // Per-face normals, area-weighted (the raw edge cross product, magnitude ∝ 2×area). Faces that
  // reference a vertex past the buffer are skipped from all normal/emit work.
  const faceNormals = new Float64Array(faceCount * 3);
  const incidentFaces: number[][] = Array.from({ length: vertexCount }, () => []);
  const faceValid = new Uint8Array(faceCount);
  let droppedFaces = 0;
  for (let f = 0; f < faceCount; f++) {
    const i0 = mesh.faces[f * 3];
    const i1 = mesh.faces[f * 3 + 1];
    const i2 = mesh.faces[f * 3 + 2];
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
    warnings?.push(
      `createSceneFrom3ds: mesh '${mesh.name}' has ${droppedFaces} face(s) with a vertex index past its ${vertexCount} vertices; those faces were dropped`,
    );
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
      indices.push(
        emitCorner(f, mesh.faces[f * 3]),
        emitCorner(f, mesh.faces[f * 3 + 1]),
        emitCorner(f, mesh.faces[f * 3 + 2]),
      );
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
      resolveThreeDsMaterial(group.name, materials, materialIndexByName, document),
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

  const documentMesh: SceneDocumentMesh = { geometry, materials: meshMaterials };
  const meshIndex = document.meshes.length;
  document.meshes.push(documentMesh);
  // A 3DS named object holds a single trimesh, so the name belongs on the Mesh node itself. Match glTF:
  // a lone mesh is a bare Mesh node, named.
  const node: SceneDocumentNode = { children: [], kind: MeshKind, mesh: meshIndex, transform: createTransform3D() };
  if (mesh.name.length > 0) node.name = mesh.name;
  const nodeIndex = document.nodes.length;
  document.nodes.push(node);
  document.scenes[0].rootNodes.push(nodeIndex);
}

// Resolves a 3DS material name to its document material index, registering it (converted to BlinnPhong)
// on first use and memoizing in `materialIndexByName` so a material shared across meshes registers once.
// Returns -1 for an empty name or a name absent from the file's material table (a default-material subset).
function resolveThreeDsMaterial(
  name: string,
  materials: Readonly<Map<string, ThreeDsMaterial>>,
  materialIndexByName: Map<string, number>,
  document: SceneDocument,
): number {
  if (name.length === 0) return -1;
  const parsed = materials.get(name);
  if (parsed === undefined) return -1;
  const cached = materialIndexByName.get(name);
  if (cached !== undefined) return cached;
  const index = document.materials.length;
  document.materials.push(threeDsMaterialToBlinnPhong(parsed, document) as unknown as MaterialLike);
  materialIndexByName.set(name, index);
  return index;
}

// Converts a parsed 3DS material to Flight's BlinnPhongMaterial — 3DS's own diffuse/specular shading
// model. Diffuse and specular colors map directly; shininess maps to the specular exponent; the diffuse
// and bump texture filenames become Unresolved External diffuseMap/normalMap refs; and a below-opaque
// material folds its opacity into the diffuse alpha plus a blend alphaMode. The ambient color has no
// Blinn-Phong equivalent (ambient is a scene light in Flight), so it is dropped; a caller wanting PBR
// converts explicitly.
function threeDsMaterialToBlinnPhong(material: Readonly<ThreeDsMaterial>, document: SceneDocument): Material {
  const result = createBlinnPhongMaterial({
    diffuse: packThreeDsColor(material.diffuse, material.opacity),
    diffuseMap:
      material.textureFilename !== null
        ? createExternalTextureRef(material.textureFilename, null, document.resources)
        : null,
    normalMap:
      material.bumpFilename !== null ? createExternalTextureRef(material.bumpFilename, null, document.resources) : null,
    specular: packThreeDsColor(material.specular),
    ...(material.shininess > 0 ? { shininess: material.shininess } : {}),
  });
  // Preserve the 3DS material chunk name as the material's authored name (empty → anonymous).
  result.name = material.name.length > 0 ? material.name : null;
  // A material below full opacity blends: the opacity rode into the diffuse alpha above; the blend
  // alphaMode makes the renderer actually blend rather than treat the alpha as coverage.
  if (material.opacity < 1) result.alphaMode = 'blend';
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
  let shininess = 0;
  let specular: readonly [number, number, number] = [1, 1, 1];
  let textureFilename: string | null = null;

  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkLength = readChunkLength(view, cursor);
    const chunkEnd = cursor + chunkLength;
    if (chunkLength < THREE_DS_CHUNK_HEADER_BYTES || chunkEnd > end) break;
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
    }

    cursor = chunkEnd;
  }

  return { ambient, bumpFilename, diffuse, name, opacity, shininess, specular, textureFilename };
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
    const chunkLength = readChunkLength(view, cursor);
    const chunkEnd = cursor + chunkLength;
    if (chunkLength < THREE_DS_CHUNK_HEADER_BYTES || chunkEnd > end) break;
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
    const chunkLength = readChunkLength(view, cursor);
    const chunkEnd = cursor + chunkLength;
    if (chunkLength < THREE_DS_CHUNK_HEADER_BYTES || chunkEnd > end) break;
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
    const chunkLength = readChunkLength(view, cursor);
    const chunkEnd = cursor + chunkLength;
    if (chunkLength < THREE_DS_CHUNK_HEADER_BYTES || chunkEnd > end) break;
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
function readChunkLength(view: Readonly<DataView>, offset: number): number {
  return view.getUint32(offset + 2, true);
}
