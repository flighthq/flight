import { createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import type { SceneNode } from '@flighthq/types';

import { CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT, swapPositionsYZ } from './shared';
import type { ThreeDsMesh } from './threeDsSchema';
import {
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_EDITOR,
  THREE_DS_FACES,
  THREE_DS_MAIN,
  THREE_DS_OBJECT,
  THREE_DS_TRIMESH,
  THREE_DS_UV_COORDS,
  THREE_DS_VERTICES,
} from './threeDsSchema';

// Parses an Autodesk 3DS binary file into a Scene. The 3DS format is a recursive chunk tree
// (little-endian): each chunk has a uint16 ID, a uint32 total length (including the 6-byte header),
// and a payload of sub-chunks and/or inline data. The editor chunk (0x3D3D) contains named objects
// (0x4000), each of which may contain a triangle mesh (0x4100) with vertex, face, and UV sub-chunks.
//
// Each mesh becomes a Mesh scene node with the canonical PBR vertex layout. The 3DS coordinate
// system is left-handed Z-up; positions are converted to Flight's right-handed Y-up via
// swapPositionsYZ. The Y↔Z reflection (det = -1) handles both the up-axis and handedness flip,
// so face winding is preserved as-is from the file.
//
// The 3DS format limits each mesh to 65535 vertices (uint16 indices). Multiple mesh objects are
// common in practice and each becomes a separate Mesh child of the scene.
//
// Malformed or truncated input pushes a warning and returns an empty or partial scene; the function
// never throws on bad input.
export function createSceneFrom3ds(bytes: Readonly<Uint8Array>, warnings?: string[]): Scene {
  const scene = createScene();

  if (bytes.byteLength < THREE_DS_CHUNK_HEADER_BYTES) {
    warnings?.push('createSceneFrom3ds: input is smaller than the minimum chunk header (6 bytes)');
    return scene;
  }

  const source = bytes as Uint8Array;
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);

  const mainId = view.getUint16(0, true);
  if (mainId !== THREE_DS_MAIN) {
    warnings?.push(
      `createSceneFrom3ds: expected main chunk ID 0x4D4D but found 0x${mainId.toString(16).toUpperCase().padStart(4, '0')}`,
    );
    return scene;
  }

  const meshes = collectMeshes(view, 0, warnings);
  for (let i = 0; i < meshes.length; i++) {
    const meshNode = buildMeshNode(meshes[i]);
    if (meshNode !== null) addNodeChild(scene, meshNode);
  }

  return scene;
}

// Recursively walks the chunk tree starting at `offset` and collects all trimesh descriptors found
// within editor → object → trimesh sub-chunks.
function collectMeshes(view: Readonly<DataView>, offset: number, warnings?: string[]): readonly ThreeDsMesh[] {
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
      const inner = collectMeshes(view, cursor, warnings);
      for (let i = 0; i < inner.length; i++) meshes.push(inner[i]);
    } else if (chunkId === THREE_DS_OBJECT) {
      const mesh = parseObject(view, cursor, chunkEnd, warnings);
      if (mesh !== null) meshes.push(mesh);
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
      faces = parseFaces(view, dataStart, chunkEnd, warnings);
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

  return { faces, name, uvs, vertices };
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
// (v0, v1, v2, flags per face). Only the first 3 values (triangle indices) are kept.
function parseFaces(view: Readonly<DataView>, dataStart: number, end: number, warnings?: string[]): Uint16Array | null {
  if (dataStart + 2 > end) {
    warnings?.push('createSceneFrom3ds: face sub-chunk too small to read count');
    return null;
  }
  const count = view.getUint16(dataStart, true);
  const bytesNeeded = dataStart + 2 + count * 4 * 2;
  if (bytesNeeded > end) {
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
  return faces;
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

// Builds a Mesh scene node from a parsed ThreeDsMesh descriptor. Vertex positions are converted
// from LH Z-up to RH Y-up via swapPositionsYZ. Face normals are computed per-face and averaged
// at shared vertices to produce smooth normals.
function buildMeshNode(mesh: Readonly<ThreeDsMesh>): SceneNode | null {
  const vertexCount = mesh.vertices.length / 3;
  const faceCount = mesh.faces.length / 3;

  if (vertexCount === 0 || faceCount === 0) return null;

  // Convert positions from LH Z-up to RH Y-up before normal computation so all geometry
  // operates in Flight's coordinate space.
  const positions = Array.from(mesh.vertices);
  swapPositionsYZ(positions);

  const vertices = new Float32Array(vertexCount * CANONICAL_FLOATS_PER_VERTEX);
  const normals = new Float32Array(vertexCount * 3);

  // Accumulate face normals into per-vertex normals for smooth shading.
  for (let f = 0; f < faceCount; f++) {
    const i0 = mesh.faces[f * 3];
    const i1 = mesh.faces[f * 3 + 1];
    const i2 = mesh.faces[f * 3 + 2];

    const x0 = positions[i0 * 3];
    const y0 = positions[i0 * 3 + 1];
    const z0 = positions[i0 * 3 + 2];
    const x1 = positions[i1 * 3];
    const y1 = positions[i1 * 3 + 1];
    const z1 = positions[i1 * 3 + 2];
    const x2 = positions[i2 * 3];
    const y2 = positions[i2 * 3 + 1];
    const z2 = positions[i2 * 3 + 2];

    // Cross product of edge vectors to get face normal.
    const e1x = x1 - x0;
    const e1y = y1 - y0;
    const e1z = z1 - z0;
    const e2x = x2 - x0;
    const e2y = y2 - y0;
    const e2z = z2 - z0;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    normals[i0 * 3] += nx;
    normals[i0 * 3 + 1] += ny;
    normals[i0 * 3 + 2] += nz;
    normals[i1 * 3] += nx;
    normals[i1 * 3 + 1] += ny;
    normals[i1 * 3 + 2] += nz;
    normals[i2 * 3] += nx;
    normals[i2 * 3 + 1] += ny;
    normals[i2 * 3 + 2] += nz;
  }

  // Normalize accumulated normals and fill the interleaved vertex buffer.
  for (let v = 0; v < vertexCount; v++) {
    const o = v * CANONICAL_FLOATS_PER_VERTEX;

    vertices[o] = positions[v * 3];
    vertices[o + 1] = positions[v * 3 + 1];
    vertices[o + 2] = positions[v * 3 + 2];

    // Normalize the accumulated face normal.
    let nnx = normals[v * 3];
    let nny = normals[v * 3 + 1];
    let nnz = normals[v * 3 + 2];
    const len = Math.sqrt(nnx * nnx + nny * nny + nnz * nnz);
    if (len > 0) {
      nnx /= len;
      nny /= len;
      nnz /= len;
    }
    vertices[o + 3] = nnx;
    vertices[o + 4] = nny;
    vertices[o + 5] = nnz;

    // Tangent (4 floats) — 3DS does not carry tangents; zero-filled.
    // vertices[o + 6..9] are already 0 from Float32Array initialization.

    // UV coordinates (2 floats).
    if (mesh.uvs !== null && v < mesh.uvs.length / 2) {
      vertices[o + 10] = mesh.uvs[v * 2];
      vertices[o + 11] = mesh.uvs[v * 2 + 1];
    }
    // else: already 0 from Float32Array initialization.
  }

  const indices = Uint32Array.from(mesh.faces);
  const geometry = createMeshGeometry({ indices, layout: CANONICAL_LAYOUT, vertices });

  // A 3DS named object holds a single trimesh, so the name belongs on the Mesh node itself — the
  // Mesh is a SceneNode and carries its own name. Wrapping it in a transform-only group would only
  // hide the Mesh a level down (getNodeChildren returning geometry:null wrappers). Match glTF: a
  // lone mesh is returned bare, named.
  return createMesh(
    geometry,
    [],
    undefined,
    mesh.name.length > 0 ? { name: mesh.name } : undefined,
  ) as unknown as SceneNode;
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
