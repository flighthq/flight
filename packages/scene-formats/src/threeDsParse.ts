import { createBlinnPhongMaterial } from '@flighthq/materials';
import { createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import type { Material, SceneNode } from '@flighthq/types';

import {
  CANONICAL_FLOATS_PER_VERTEX,
  CANONICAL_LAYOUT,
  convertPositionsZUpToYUp,
  createExternalTextureRef,
} from './shared';
import type { ThreeDsMaterial, ThreeDsMesh } from './threeDsSchema';
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
  THREE_DS_MATERIAL_DIFFUSE,
  THREE_DS_MATERIAL_NAME,
  THREE_DS_MATERIAL_SPECULAR,
  THREE_DS_MATERIAL_TEXTURE_FILENAME,
  THREE_DS_MATERIAL_TEXTURE_MAP,
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
// system is right-handed Z-up (like MD2/MD5); positions are converted to Flight's right-handed
// Y-up via convertPositionsZUpToYUp, a -90° rotation about X ((x, y, z) → (x, z, -y), det = +1).
// Because the conversion is a rotation, not a reflection, triangle winding and computed normals
// are preserved as-is from the file — no winding reversal is needed.
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

  // The material table (0xAFFF chunks) and the meshes are siblings under the editor chunk, and a mesh
  // references its materials by name via FACE_MATERIAL — so collect the whole table first, then
  // resolve each mesh's referenced names against it.
  const materials = new Map<string, ThreeDsMaterial>();
  const meshes = collectMeshes(view, 0, materials, warnings);
  const resolved = new Map<string, Material>();
  for (let i = 0; i < meshes.length; i++) {
    const meshNode = buildMeshNode(meshes[i], materials, resolved);
    if (meshNode !== null) addNodeChild(scene.root, meshNode);
  }

  return scene;
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
  let materialNames: readonly string[] = [];

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
        materialNames = parsed.materialNames;
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

  return { faces, materialNames, name, uvs, vertices };
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
// (v0, v1, v2, flags per face). Only the first 3 values (triangle indices) are kept. FACE_MATERIAL
// (0x4130) sub-chunks follow the face array within the same chunk; their material names are collected
// (each names a material the mesh's faces use). Returns both the triangle indices and those names.
function parseFaces(
  view: Readonly<DataView>,
  dataStart: number,
  end: number,
  warnings?: string[],
): { faces: Uint16Array; materialNames: readonly string[] } | null {
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
  const materialNames: string[] = [];
  let cursor = facesEnd;
  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const subId = view.getUint16(cursor, true);
    const subLength = readChunkLength(view, cursor);
    const subEnd = cursor + subLength;
    if (subLength < THREE_DS_CHUNK_HEADER_BYTES || subEnd > end) break;
    if (subId === THREE_DS_FACE_MATERIAL) {
      const dataOffset = cursor + THREE_DS_CHUNK_HEADER_BYTES;
      const materialName = readNullTerminatedString(view, dataOffset, subEnd);
      if (materialName.length > 0) materialNames.push(materialName);
    }
    cursor = subEnd;
  }

  return { faces, materialNames };
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
// from RH Z-up to RH Y-up via convertPositionsZUpToYUp. Face normals are computed per-face and
// averaged at shared vertices to produce smooth normals. The materials the mesh's faces reference
// are resolved against the file's material table (memoized in `resolved`) and attached to the Mesh node.
function buildMeshNode(
  mesh: Readonly<ThreeDsMesh>,
  materials: Readonly<Map<string, ThreeDsMaterial>>,
  resolved: Map<string, Material>,
): SceneNode | null {
  const vertexCount = mesh.vertices.length / 3;
  const faceCount = mesh.faces.length / 3;

  if (vertexCount === 0 || faceCount === 0) return null;

  // Convert positions from RH Z-up to RH Y-up before normal computation so all geometry
  // operates in Flight's coordinate space. The rotation preserves winding, so computed normals
  // come out facing outward and front faces are not culled.
  const positions = Array.from(mesh.vertices);
  convertPositionsZUpToYUp(positions);

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
      vertices[o + 11] = 1 - mesh.uvs[v * 2 + 1];
    }
    // else: already 0 from Float32Array initialization.
  }

  const indices = Uint32Array.from(mesh.faces);
  const geometry = createMeshGeometry({ indices, layout: CANONICAL_LAYOUT, vertices });

  // Resolve each distinct material name the mesh references to a BlinnPhongMaterial, memoized so a
  // material shared across meshes yields one instance. 3DS assigns materials per face-subset, but this
  // importer keeps the mesh geometry whole, so the referenced materials are attached in file order
  // without splitting the geometry into subsets.
  const meshMaterials: Material[] = [];
  const seen = new Set<string>();
  for (const materialName of mesh.materialNames) {
    if (seen.has(materialName)) continue;
    seen.add(materialName);
    const parsed = materials.get(materialName);
    if (parsed === undefined) continue;
    let material = resolved.get(materialName);
    if (material === undefined) {
      material = threeDsMaterialToBlinnPhong(parsed);
      resolved.set(materialName, material);
    }
    meshMaterials.push(material);
  }

  // A 3DS named object holds a single trimesh, so the name belongs on the Mesh node itself — the
  // Mesh is a SceneNode and carries its own name. Wrapping it in a transform-only group would only
  // hide the Mesh a level down (getNodeChildren returning geometry:null wrappers). Match glTF: a
  // lone mesh is returned bare, named.
  return createMesh(
    geometry,
    meshMaterials,
    undefined,
    mesh.name.length > 0 ? { name: mesh.name } : undefined,
  ) as unknown as SceneNode;
}

// Converts a parsed 3DS material to Flight's BlinnPhongMaterial — 3DS's own diffuse/specular shading
// model. The diffuse and specular colors map directly; the texture map filename becomes an Unresolved
// External diffuseMap ref. The ambient color has no Blinn-Phong equivalent (ambient is a scene light
// in Flight), so it is dropped; a caller wanting PBR converts explicitly.
function threeDsMaterialToBlinnPhong(material: Readonly<ThreeDsMaterial>): Material {
  const result = createBlinnPhongMaterial({
    diffuse: packThreeDsColor(material.diffuse),
    diffuseMap: material.textureFilename !== null ? createExternalTextureRef(material.textureFilename) : null,
    specular: packThreeDsColor(material.specular),
  }) as unknown as Material;
  // Preserve the 3DS material chunk name as the material's authored name (empty → anonymous).
  result.name = material.name.length > 0 ? material.name : null;
  return result;
}

// Parses a material block (0xAFFF): walks sub-chunks for the name, the diffuse/specular/ambient color
// blocks, and the diffuse texture map's filename.
function parseMaterial(view: Readonly<DataView>, offset: number, end: number): ThreeDsMaterial {
  let name = '';
  let ambient: readonly [number, number, number] = [0, 0, 0];
  let diffuse: readonly [number, number, number] = [1, 1, 1];
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
    } else if (chunkId === THREE_DS_MATERIAL_TEXTURE_MAP) {
      textureFilename = parseTextureFilename(view, dataStart, chunkEnd);
    }

    cursor = chunkEnd;
  }

  return { ambient, diffuse, name, specular, textureFilename };
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

// Reads the diffuse texture map block (0xA200), returning its filename sub-chunk (0xA300) or null.
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

// Packs a 3DS sRGB-space [r,g,b] triple (each in [0,1]) into an opaque 0xRRGGBBAA integer.
function packThreeDsColor(rgb: readonly [number, number, number]): number {
  const r = Math.round(Math.min(1, Math.max(0, rgb[0])) * 0xff);
  const g = Math.round(Math.min(1, Math.max(0, rgb[1])) * 0xff);
  const b = Math.round(Math.min(1, Math.max(0, rgb[2])) * 0xff);
  return ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
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
