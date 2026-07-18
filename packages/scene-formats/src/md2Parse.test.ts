import {
  getMeshGeometryIndexCount,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh';
import { getNodeChildren } from '@flighthq/node';
import { isMesh } from '@flighthq/scene';
import type { BlinnPhongMaterial, ExternalSceneResourceRef, Mesh, SceneNode } from '@flighthq/types';
import { BlinnPhongMaterialKind } from '@flighthq/types';

import { createSceneFromMd2, importMd2 } from './md2Parse';
import { MD2_ANORMS } from './md2Schema';

// Builds a minimal valid MD2 binary buffer with one frame and the given triangles, vertices, and
// texcoords. All offsets are computed from the data sizes.
function buildMd2(options: {
  compressedVertices: readonly { normalIndex: number; x: number; y: number; z: number }[];
  magic?: number;
  numFrames?: number;
  scale?: readonly [number, number, number];
  skin?: string;
  skinHeight?: number;
  skinWidth?: number;
  texCoords: readonly { s: number; t: number }[];
  translate?: readonly [number, number, number];
  triangles: readonly {
    texIndices: readonly [number, number, number];
    vertIndices: readonly [number, number, number];
  }[];
  version?: number;
}): Uint8Array {
  const {
    compressedVertices,
    magic = 0x32504449,
    numFrames = 1,
    scale = [1, 1, 1],
    skin,
    skinHeight = 64,
    skinWidth = 64,
    texCoords,
    translate = [0, 0, 0],
    triangles,
    version = 8,
  } = options;

  const numVertices = compressedVertices.length;
  const numTexCoords = texCoords.length;
  const numTriangles = triangles.length;
  const numSkins = skin !== undefined ? 1 : 0;

  // Compute offsets: header(68) + skins + texcoords + triangles + frame(s).
  const offSkins = 68;
  const offTexCoords = offSkins + numSkins * 64;
  const offTriangles = offTexCoords + numTexCoords * 4;
  const frameSize = 40 + numVertices * 4;
  const offFrames = offTriangles + numTriangles * 12;
  const offEnd = offFrames + numFrames * frameSize;

  const buffer = new ArrayBuffer(offEnd);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Header (68 bytes, 17 int32 fields).
  view.setInt32(0, magic, true);
  view.setInt32(4, version, true);
  view.setInt32(8, skinWidth, true);
  view.setInt32(12, skinHeight, true);
  view.setInt32(16, frameSize, true);
  view.setInt32(20, numSkins, true);
  view.setInt32(24, numVertices, true);
  view.setInt32(28, numTexCoords, true);
  view.setInt32(32, numTriangles, true);
  view.setInt32(36, 0, true); // numGlCommands
  view.setInt32(40, numFrames, true);
  view.setInt32(44, numSkins > 0 ? offSkins : 0, true);
  view.setInt32(48, offTexCoords, true);
  view.setInt32(52, offTriangles, true);
  view.setInt32(56, offFrames, true);
  view.setInt32(60, 0, true); // offGlCommands
  view.setInt32(64, offEnd, true);

  // Skin record: a 64-byte null-padded ASCII path.
  if (skin !== undefined) {
    for (let i = 0; i < skin.length && i < 63; i++) bytes[offSkins + i] = skin.charCodeAt(i);
  }

  // Texcoords: int16 s, int16 t.
  for (let i = 0; i < numTexCoords; i++) {
    const base = offTexCoords + i * 4;
    view.setInt16(base, texCoords[i].s, true);
    view.setInt16(base + 2, texCoords[i].t, true);
  }

  // Triangles: 3 uint16 vertex indices + 3 uint16 texcoord indices.
  for (let i = 0; i < numTriangles; i++) {
    const base = offTriangles + i * 12;
    for (let c = 0; c < 3; c++) {
      view.setUint16(base + c * 2, triangles[i].vertIndices[c], true);
    }
    for (let c = 0; c < 3; c++) {
      view.setUint16(base + 6 + c * 2, triangles[i].texIndices[c], true);
    }
  }

  // Frame 0: scale(3 float32) + translate(3 float32) + name(16 chars) + compressed vertices.
  if (numFrames > 0) {
    const frameBase = offFrames;
    view.setFloat32(frameBase, scale[0], true);
    view.setFloat32(frameBase + 4, scale[1], true);
    view.setFloat32(frameBase + 8, scale[2], true);
    view.setFloat32(frameBase + 12, translate[0], true);
    view.setFloat32(frameBase + 16, translate[1], true);
    view.setFloat32(frameBase + 20, translate[2], true);
    // Name is left as zeros (null-terminated empty string).
    for (let i = 0; i < numVertices; i++) {
      const vBase = frameBase + 40 + i * 4;
      bytes[vBase] = compressedVertices[i].x;
      bytes[vBase + 1] = compressedVertices[i].y;
      bytes[vBase + 2] = compressedVertices[i].z;
      bytes[vBase + 3] = compressedVertices[i].normalIndex;
    }
  }

  return bytes;
}

describe('createSceneFromMd2', () => {
  it('deduplicates vertices sharing the same vertex/texcoord pair', () => {
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 10, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 10, z: 0 },
      ],
      scale: [1, 1, 1],
      texCoords: [{ s: 0, t: 0 }],
      translate: [0, 0, 0],
      triangles: [
        { texIndices: [0, 0, 0], vertIndices: [0, 1, 2] },
        { texIndices: [0, 0, 0], vertIndices: [2, 1, 0] },
      ],
    });

    const scene = createSceneFromMd2(md2);
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;
    // 3 unique vertex/texcoord combos, 6 indices (2 triangles).
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    expect(getMeshGeometryIndexCount(geometry)).toBe(6);
  });

  it('lookups normals from the Anorms table', () => {
    // Use normal index 5 which is [0, 0, 1].
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 5, x: 0, y: 0, z: 0 },
        { normalIndex: 5, x: 10, y: 0, z: 0 },
        { normalIndex: 5, x: 0, y: 10, z: 0 },
      ],
      scale: [1, 1, 1],
      texCoords: [{ s: 0, t: 0 }],
      translate: [0, 0, 0],
      triangles: [{ texIndices: [0, 0, 0], vertIndices: [0, 1, 2] }],
    });

    const scene = createSceneFromMd2(md2);
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;
    const n = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexNormal(n, geometry, 0);
    const expected = MD2_ANORMS[5];
    expect(n.x).toBeCloseTo(expected[0], 5);
    expect(n.y).toBeCloseTo(expected[2], 5);
    expect(n.z).toBeCloseTo(-expected[1], 5);
  });

  it('parses a single triangle with vertex decompression', () => {
    // Compressed vertices at (10, 20, 30) with scale [0.5, 0.5, 0.5] and translate [1, 2, 3]
    // decompressed = (10*0.5+1, 20*0.5+2, 30*0.5+3) = (6, 12, 18)
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 10, y: 20, z: 30 },
        { normalIndex: 0, x: 20, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 40, z: 0 },
      ],
      scale: [0.5, 0.5, 0.5],
      texCoords: [
        { s: 0, t: 0 },
        { s: 32, t: 0 },
        { s: 0, t: 32 },
      ],
      translate: [1, 2, 3],
      triangles: [{ texIndices: [0, 1, 2], vertIndices: [0, 1, 2] }],
    });

    const scene = createSceneFromMd2(md2);
    const children = getNodeChildren(scene);
    expect(children).toHaveLength(1);
    expect(isMesh(children[0] as SceneNode)).toBe(true);

    const geometry = (children[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    expect(getMeshGeometryIndexCount(geometry)).toBe(3);

    // Decompressed MD2 position: (10*0.5+1, 20*0.5+2, 30*0.5+3) = (6, 12, 18).
    // Z-up to Y-up: (x, z, -y) = (6, 18, -12).
    const p = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 0);
    expect(p.x).toBeCloseTo(6, 5);
    expect(p.y).toBeCloseTo(18, 5);
    expect(p.z).toBeCloseTo(-12, 5);
  });

  it("decodes the model's skin to a BlinnPhongMaterial referencing the skin path as a diffuseMap", () => {
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 1, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 1, z: 0 },
      ],
      skin: 'players/hero/skin.pcx',
      texCoords: [
        { s: 0, t: 0 },
        { s: 1, t: 0 },
        { s: 0, t: 1 },
      ],
      triangles: [{ texIndices: [0, 1, 2], vertIndices: [0, 1, 2] }],
    });

    const mesh = getNodeChildren(createSceneFromMd2(md2))[0] as Mesh;
    expect(mesh.materials).toHaveLength(1);
    const material = mesh.materials[0] as BlinnPhongMaterial;
    expect(material.kind).toBe(BlinnPhongMaterialKind);
    // The skin path is referenced, not decoded: an Unresolved External ref, image left null.
    expect((material.diffuseMap!.resource as ExternalSceneResourceRef).uri).toBe('players/hero/skin.pcx');
    expect(material.diffuseMap!.image).toBeNull();
  });

  it('leaves the mesh unmaterialed when the model declares no skin', () => {
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 1, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 1, z: 0 },
      ],
      texCoords: [
        { s: 0, t: 0 },
        { s: 1, t: 0 },
        { s: 0, t: 1 },
      ],
      triangles: [{ texIndices: [0, 1, 2], vertIndices: [0, 1, 2] }],
    });

    const mesh = getNodeChildren(createSceneFromMd2(md2))[0] as Mesh;
    expect(mesh.materials).toHaveLength(0);
  });

  it('returns an empty scene for input shorter than the header', () => {
    const warnings: string[] = [];
    const scene = createSceneFromMd2(new Uint8Array(10), warnings);
    expect(getNodeChildren(scene)).toHaveLength(0);
    expect(warnings.some((w) => w.includes('shorter than'))).toBe(true);
  });

  it('returns an empty scene for invalid magic', () => {
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 10, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 10, z: 0 },
      ],
      magic: 0x12345678,
      texCoords: [{ s: 0, t: 0 }],
      triangles: [{ texIndices: [0, 0, 0], vertIndices: [0, 1, 2] }],
    });

    const warnings: string[] = [];
    const scene = createSceneFromMd2(md2, warnings);
    expect(getNodeChildren(scene)).toHaveLength(0);
    expect(warnings.some((w) => w.includes('invalid magic'))).toBe(true);
  });

  it('returns an empty scene for unsupported version', () => {
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 10, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 10, z: 0 },
      ],
      texCoords: [{ s: 0, t: 0 }],
      triangles: [{ texIndices: [0, 0, 0], vertIndices: [0, 1, 2] }],
      version: 99,
    });

    const warnings: string[] = [];
    const scene = createSceneFromMd2(md2, warnings);
    expect(getNodeChildren(scene)).toHaveLength(0);
    expect(warnings.some((w) => w.includes('unsupported version'))).toBe(true);
  });

  it('returns an empty scene when the buffer is truncated', () => {
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 10, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 10, z: 0 },
      ],
      texCoords: [{ s: 0, t: 0 }],
      triangles: [{ texIndices: [0, 0, 0], vertIndices: [0, 1, 2] }],
    });

    // Truncate the buffer to cut off the frame data.
    const truncated = md2.slice(0, 70);
    const warnings: string[] = [];
    const scene = createSceneFromMd2(truncated, warnings);
    expect(getNodeChildren(scene)).toHaveLength(0);
    expect(warnings.some((w) => w.includes('truncated'))).toBe(true);
  });

  it('returns an empty scene when numFrames is zero', () => {
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 10, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 10, z: 0 },
      ],
      numFrames: 0,
      texCoords: [{ s: 0, t: 0 }],
      triangles: [{ texIndices: [0, 0, 0], vertIndices: [0, 1, 2] }],
    });

    const warnings: string[] = [];
    const scene = createSceneFromMd2(md2, warnings);
    expect(getNodeChildren(scene)).toHaveLength(0);
    expect(warnings.some((w) => w.includes('no frames'))).toBe(true);
  });

  it('scales UV coordinates by skinWidth and skinHeight', () => {
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 10, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 10, z: 0 },
      ],
      skinHeight: 128,
      skinWidth: 256,
      texCoords: [
        { s: 128, t: 64 },
        { s: 256, t: 128 },
        { s: 0, t: 0 },
      ],
      translate: [0, 0, 0],
      triangles: [{ texIndices: [0, 1, 2], vertIndices: [0, 1, 2] }],
    });

    const scene = createSceneFromMd2(md2);
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;

    const uv = { x: 0, y: 0 };
    getMeshGeometryVertexUv0(uv, geometry, 0);
    expect(uv.x).toBeCloseTo(128 / 256, 5); // 0.5
    expect(uv.y).toBeCloseTo(64 / 128, 5); // 0.5

    getMeshGeometryVertexUv0(uv, geometry, 1);
    expect(uv.x).toBeCloseTo(1.0, 5);
    expect(uv.y).toBeCloseTo(1.0, 5);

    getMeshGeometryVertexUv0(uv, geometry, 2);
    expect(uv.x).toBeCloseTo(0.0, 5);
    expect(uv.y).toBeCloseTo(0.0, 5);
  });

  it('splits vertices when the same position has different texcoords', () => {
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 10, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 10, z: 0 },
      ],
      texCoords: [
        { s: 0, t: 0 },
        { s: 32, t: 32 },
      ],
      translate: [0, 0, 0],
      triangles: [
        { texIndices: [0, 0, 0], vertIndices: [0, 1, 2] },
        { texIndices: [1, 1, 1], vertIndices: [0, 1, 2] },
      ],
    });

    const scene = createSceneFromMd2(md2);
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;
    // 3 vertices * 2 texcoord variants = 6 unique vertices.
    expect(getMeshGeometryVertexCount(geometry)).toBe(6);
    expect(getMeshGeometryIndexCount(geometry)).toBe(6);
  });

  it('warns on out-of-range vertex indices without crashing', () => {
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 10, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 10, z: 0 },
      ],
      texCoords: [{ s: 0, t: 0 }],
      translate: [0, 0, 0],
      triangles: [
        { texIndices: [0, 0, 0], vertIndices: [0, 1, 2] },
        { texIndices: [0, 0, 0], vertIndices: [99, 1, 2] },
      ],
    });

    const warnings: string[] = [];
    const scene = createSceneFromMd2(md2, warnings);
    // First triangle should still produce a mesh.
    expect(getNodeChildren(scene)).toHaveLength(1);
    expect(warnings.some((w) => w.includes('vertex index') && w.includes('out of range'))).toBe(true);
  });

  it('warns on out-of-range texcoord indices without crashing', () => {
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 10, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 10, z: 0 },
      ],
      texCoords: [{ s: 0, t: 0 }],
      translate: [0, 0, 0],
      triangles: [
        { texIndices: [0, 0, 0], vertIndices: [0, 1, 2] },
        { texIndices: [99, 0, 0], vertIndices: [0, 1, 2] },
      ],
    });

    const warnings: string[] = [];
    const scene = createSceneFromMd2(md2, warnings);
    expect(getNodeChildren(scene)).toHaveLength(1);
    expect(warnings.some((w) => w.includes('texcoord index') && w.includes('out of range'))).toBe(true);
  });
});

describe('importMd2', () => {
  it('wraps the scene with one scene and empty animations (morph animation deferred)', () => {
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 1, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 1, z: 0 },
      ],
      texCoords: [
        { s: 0, t: 0 },
        { s: 1, t: 0 },
        { s: 0, t: 1 },
      ],
      triangles: [{ texIndices: [0, 1, 2], vertIndices: [0, 1, 2] }],
    });
    const result = importMd2(md2);
    expect(result.scenes).toHaveLength(1);
    expect(result.scene).toBe(result.scenes[0]);
    expect(result.animations).toHaveLength(0);
    expect(getNodeChildren(result.scene)).toHaveLength(1);
  });
});
