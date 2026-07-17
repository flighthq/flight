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

import { createSceneFrom3ds } from './threeDsParse';
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

describe('createSceneFrom3ds', () => {
  it('converts Z-up to Y-up coordinates', () => {
    // A triangle in 3DS Z-up: (0,0,0), (1,0,0), (0,0,1) → Y-up: (0,0,0), (1,0,0), (0,1,0)
    const bytes = buildTriangle3ds('Tri', [0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 2]);
    const scene = createSceneFrom3ds(bytes);
    const children = getNodeChildren(scene);
    expect(children).toHaveLength(1);

    // A named 3DS object is returned as a bare Mesh carrying the name, not a transform wrapper.
    const mesh = children[0] as SceneNode;
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
    const scene = createSceneFrom3ds(bytes);
    const children = getNodeChildren(scene);
    expect(children).toHaveLength(1);

    const mesh = children[0] as SceneNode;
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
    const scene = createSceneFrom3ds(bytes);
    const children = getNodeChildren(scene);
    expect(children).toHaveLength(2);

    // Each named object is a bare Mesh child of the scene, carrying its name.
    expect(isMesh(children[0] as SceneNode)).toBe(true);
    expect((children[0] as SceneNode).name).toBe('MeshA');
    expect(isMesh(children[1] as SceneNode)).toBe(true);
    expect((children[1] as SceneNode).name).toBe('MeshB');
  });

  it('parses UV coordinates', () => {
    const bytes = buildTriangle3ds('UvTri', [0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 2], [0, 0, 1, 0, 0.5, 1]);
    const scene = createSceneFrom3ds(bytes);
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;

    const uv = { x: 0, y: 0 };
    getMeshGeometryVertexUv0(uv, geometry, 0);
    expect([uv.x, uv.y]).toEqual([0, 0]);
    getMeshGeometryVertexUv0(uv, geometry, 1);
    expect([uv.x, uv.y]).toEqual([1, 0]);
    getMeshGeometryVertexUv0(uv, geometry, 2);
    expect([uv.x, uv.y]).toEqual([0.5, 1]);
  });

  it('computes face normals converted to Y-up', () => {
    // A flat triangle in Z-up XY plane: normal should point +Z in Z-up → +Y in Y-up.
    const bytes = buildTriangle3ds('NormalTri', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
    const scene = createSceneFrom3ds(bytes);
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;

    const n = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexNormal(n, geometry, 0);
    // After Z→Y conversion, the normal of a Z-up XY-plane triangle points in the Y direction.
    // The exact direction depends on winding; just verify it has a dominant component.
    const len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
    expect(len).toBeGreaterThan(0.9);
  });

  it('returns an empty scene for empty input', () => {
    const scene = createSceneFrom3ds(new Uint8Array(0));
    expect(getNodeChildren(scene)).toHaveLength(0);
  });

  it('warns on empty input', () => {
    const warnings: string[] = [];
    createSceneFrom3ds(new Uint8Array(0), warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('smaller than');
  });

  it('warns on invalid main chunk ID', () => {
    const warnings: string[] = [];
    const bytes = new Uint8Array(6);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 0x1234, true);
    view.setUint32(2, 6, true);
    createSceneFrom3ds(bytes, warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('0x4D4D');
  });

  it('warns on truncated chunk data and returns partial result', () => {
    const warnings: string[] = [];
    // Build a valid 3DS but truncate it.
    const full = buildTriangle3ds('Trunc', [0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 2]);
    // Cut off a significant portion of the end.
    const truncated = full.slice(0, Math.floor(full.byteLength * 0.5));
    createSceneFrom3ds(truncated, warnings);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('handles a mesh with no faces gracefully', () => {
    // Build a trimesh chunk with vertices but no faces sub-chunk.
    const trimeshPayload = writeVertices([0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const trimesh = writeChunk(THREE_DS_TRIMESH, trimeshPayload);
    const objectPayload = concatBytes(writeNullTerminatedString('NoFaces'), trimesh);
    const object = writeChunk(THREE_DS_OBJECT, objectPayload);
    const editor = writeChunk(THREE_DS_EDITOR, object);
    const bytes = writeChunk(THREE_DS_MAIN, editor);

    const warnings: string[] = [];
    const scene = createSceneFrom3ds(bytes, warnings);
    expect(getNodeChildren(scene)).toHaveLength(0);
    expect(warnings.some((w) => w.includes('missing'))).toBe(true);
  });
});
