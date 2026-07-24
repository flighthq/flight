import {
  getMeshGeometryIndexCount,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh';
import { getNodeChildren } from '@flighthq/node';
import { isMesh } from '@flighthq/scene';
import type {
  BlinnPhongMaterial,
  ExternalImageResourceReference,
  Mesh,
  SceneAnimationTarget,
  SceneNode,
} from '@flighthq/types';
import { BlinnPhongMaterialKind } from '@flighthq/types';

import { createSceneFromMd2, parseMd2 } from './md2Parse';
import { MD2_ANORMS } from './md2Schema';

// Builds a minimal valid MD2 binary buffer with one frame and the given triangles, vertices, and
// texcoords. All offsets are computed from the data sizes.
function buildMd2(options: {
  compressedVertices: readonly { normalIndex: number; x: number; y: number; z: number }[];
  // Optional per-frame vertex data for frames 1..N (frame 0 always uses `compressedVertices`). When
  // omitted, extra frames are zero-filled. Length should be numFrames-1 when provided.
  extraFrames?: readonly (readonly { normalIndex: number; x: number; y: number; z: number }[])[];
  // Optional per-frame 16-byte name labels (index 0..numFrames-1). Omitted names stay all-null (empty).
  frameNames?: readonly string[];
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
    extraFrames = [],
    frameNames = [],
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

  // Each frame: scale(3 float32) + translate(3 float32) + name(16 chars) + compressed vertices. Frame 0
  // uses `compressedVertices`; frames 1..N use `extraFrames` when supplied (zero-filled otherwise). All
  // frames share the same scale/translate here (the fixtures exercise deltas, not per-frame requant).
  for (let f = 0; f < numFrames; f++) {
    const frameBase = offFrames + f * frameSize;
    view.setFloat32(frameBase, scale[0], true);
    view.setFloat32(frameBase + 4, scale[1], true);
    view.setFloat32(frameBase + 8, scale[2], true);
    view.setFloat32(frameBase + 12, translate[0], true);
    view.setFloat32(frameBase + 16, translate[1], true);
    view.setFloat32(frameBase + 20, translate[2], true);
    // Frame name: a 16-byte null-padded ASCII label at frameBase + 24.
    const frameName = frameNames[f];
    if (frameName !== undefined) {
      for (let i = 0; i < frameName.length && i < 15; i++) bytes[frameBase + 24 + i] = frameName.charCodeAt(i);
    }
    const frameVerts = f === 0 ? compressedVertices : (extraFrames[f - 1] ?? null);
    if (frameVerts === null) continue; // zero-filled frame
    for (let i = 0; i < numVertices; i++) {
      const vBase = frameBase + 40 + i * 4;
      bytes[vBase] = frameVerts[i].x;
      bytes[vBase + 1] = frameVerts[i].y;
      bytes[vBase + 2] = frameVerts[i].z;
      bytes[vBase + 3] = frameVerts[i].normalIndex;
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
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
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
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
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
    const children = getNodeChildren(scene.root);
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

    const mesh = getNodeChildren(createSceneFromMd2(md2).root)[0] as Mesh;
    expect(mesh.materials).toHaveLength(1);
    const material = mesh.materials[0] as BlinnPhongMaterial;
    expect(material.kind).toBe(BlinnPhongMaterialKind);
    expect(material.name).toBe('players/hero/skin.pcx'); // MD2 skin path preserved as the authored identity
    // The skin path is referenced, not decoded: an Unresolved External ref, image left null.
    expect((material.diffuseMap!.resource as ExternalImageResourceReference).uri).toBe('players/hero/skin.pcx');
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

    const mesh = getNodeChildren(createSceneFromMd2(md2).root)[0] as Mesh;
    expect(mesh.materials).toHaveLength(0);
  });

  it('returns an empty scene for input shorter than the header', () => {
    const warnings: string[] = [];
    const scene = createSceneFromMd2(new Uint8Array(10), warnings);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
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
    expect(getNodeChildren(scene.root)).toHaveLength(0);
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
    expect(getNodeChildren(scene.root)).toHaveLength(0);
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
    expect(getNodeChildren(scene.root)).toHaveLength(0);
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
    expect(getNodeChildren(scene.root)).toHaveLength(0);
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
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

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
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
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
    expect(getNodeChildren(scene.root)).toHaveLength(1);
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
    expect(getNodeChildren(scene.root)).toHaveLength(1);
    expect(warnings.some((w) => w.includes('texcoord index') && w.includes('out of range'))).toBe(true);
  });

  it('warns on an out-of-range vertex normal index and leaves that normal zero', () => {
    // normalIndex 200 is a valid uint8 but past the 162-entry Anorms table.
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 200, x: 0, y: 0, z: 0 },
        { normalIndex: 200, x: 10, y: 0, z: 0 },
        { normalIndex: 200, x: 0, y: 10, z: 0 },
      ],
      texCoords: [{ s: 0, t: 0 }],
      translate: [0, 0, 0],
      triangles: [{ texIndices: [0, 0, 0], vertIndices: [0, 1, 2] }],
    });

    const warnings: string[] = [];
    const scene = createSceneFromMd2(md2, warnings);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    const n = { x: 1, y: 1, z: 1 };
    getMeshGeometryVertexNormal(n, geometry, 0);
    expect(n).toEqual({ x: 0, y: 0, z: 0 });
    expect(warnings.some((w) => w.includes('200') && w.includes('Anorms table'))).toBe(true);
  });
});

describe('createSceneFromMd2 animations', () => {
  const singleTriangleFrame0 = [
    { normalIndex: 0, x: 0, y: 0, z: 0 },
    { normalIndex: 0, x: 1, y: 0, z: 0 },
    { normalIndex: 0, x: 0, y: 1, z: 0 },
  ] as const;
  const singleTriangleTexCoords = [
    { s: 0, t: 0 },
    { s: 1, t: 0 },
    { s: 0, t: 1 },
  ] as const;
  const singleTriangle = [{ texIndices: [0, 1, 2] as const, vertIndices: [0, 1, 2] as const }] as const;

  it('yields empty animations for a single-frame model (no vertex motion)', () => {
    const md2 = buildMd2({
      compressedVertices: singleTriangleFrame0,
      texCoords: singleTriangleTexCoords,
      triangles: singleTriangle,
    });
    const scene = createSceneFromMd2(md2);
    expect(Object.keys(scene.animations)).toHaveLength(0);
    expect(getNodeChildren(scene.root)).toHaveLength(1);
  });

  it('builds a mesh morph with one target per non-base frame (frame 1 delta from frame 0)', () => {
    // Frame 1 shifts vertex 1 from x=1 to x=3 (delta +2 in x, which is +2 in Y-up x).
    const md2 = buildMd2({
      compressedVertices: singleTriangleFrame0,
      extraFrames: [
        [
          { normalIndex: 0, x: 0, y: 0, z: 0 },
          { normalIndex: 0, x: 3, y: 0, z: 0 },
          { normalIndex: 0, x: 0, y: 1, z: 0 },
        ],
      ],
      numFrames: 2,
      texCoords: singleTriangleTexCoords,
      triangles: singleTriangle,
    });
    const mesh = getNodeChildren(createSceneFromMd2(md2).root)[0] as Mesh;
    expect(mesh.morph).not.toBeNull();
    expect(mesh.morph!.targets).toHaveLength(1);
    // The deduped vertex for source vertex 1 carries a +2 x position delta.
    const posDeltas = mesh.morph!.targets[0].positionDeltas;
    const hasShiftedVertex = Array.from({ length: posDeltas.length / 3 }, (_, v) => posDeltas[v * 3]).some(
      (dx) => Math.abs(dx - 2) < 1e-5,
    );
    expect(hasShiftedVertex).toBe(true);
  });

  it('builds a weights clip whose track width is the frame-target count and times step by 1/fps', () => {
    const md2 = buildMd2({
      compressedVertices: singleTriangleFrame0,
      extraFrames: [
        [
          { normalIndex: 0, x: 0, y: 0, z: 0 },
          { normalIndex: 0, x: 3, y: 0, z: 0 },
          { normalIndex: 0, x: 0, y: 1, z: 0 },
        ],
      ],
      numFrames: 2,
      texCoords: singleTriangleTexCoords,
      triangles: singleTriangle,
    });
    const scene = createSceneFromMd2(md2);
    expect(Object.keys(scene.animations)).toHaveLength(1);
    const clip = Object.values(scene.animations)[0];
    expect(clip.channels).toHaveLength(1);
    const channel = clip.channels[0];
    expect((channel.targetRef as SceneAnimationTarget).path).toBe('Weights');
    expect(channel.track.components).toBe(1); // one non-base frame → one target weight
    // Two frames → times [0, 0.1] at 10 fps.
    expect(channel.track.times).toHaveLength(2);
    expect(channel.track.times[0]).toBeCloseTo(0);
    expect(channel.track.times[1]).toBeCloseTo(0.1);
  });

  // A five-frame model whose frame names carry two action prefixes exercises the segmentation path.
  const fiveFrameActions = () =>
    buildMd2({
      compressedVertices: singleTriangleFrame0,
      extraFrames: [
        [
          { normalIndex: 0, x: 0, y: 0, z: 1 },
          { normalIndex: 0, x: 1, y: 0, z: 1 },
          { normalIndex: 0, x: 0, y: 1, z: 1 },
        ],
        [
          { normalIndex: 0, x: 0, y: 0, z: 2 },
          { normalIndex: 0, x: 1, y: 0, z: 2 },
          { normalIndex: 0, x: 0, y: 1, z: 2 },
        ],
        [
          { normalIndex: 0, x: 0, y: 0, z: 3 },
          { normalIndex: 0, x: 1, y: 0, z: 3 },
          { normalIndex: 0, x: 0, y: 1, z: 3 },
        ],
        [
          { normalIndex: 0, x: 0, y: 0, z: 4 },
          { normalIndex: 0, x: 1, y: 0, z: 4 },
          { normalIndex: 0, x: 0, y: 1, z: 4 },
        ],
      ],
      frameNames: ['stand01', 'stand02', 'run01', 'run02', 'run03'],
      numFrames: 5,
      texCoords: singleTriangleTexCoords,
      triangles: singleTriangle,
    });

  it('segments contiguous same-prefix frame runs into named clips with per-action frame ranges', () => {
    const document = parseMd2(fiveFrameActions());
    expect(document.animations.map((a) => a.name)).toEqual(['stand', 'run']);
    const stand = document.animations[0];
    const run = document.animations[1];
    // 'stand' spans frames 0-1 (2 keyframes); 'run' spans frames 2-4 (3 keyframes).
    expect(stand.channels[0].track.times).toHaveLength(2);
    expect(run.channels[0].track.times).toHaveLength(3);
    // Every clip's weight track keeps the full morph width (4 targets for a 5-frame model).
    expect(stand.channels[0].track.components).toBe(4);
    expect(run.channels[0].track.components).toBe(4);
  });

  it('starts every clip at local time zero regardless of its absolute frame offset', () => {
    const document = parseMd2(fiveFrameActions());
    const run = document.animations[1];
    // 'run' begins at absolute frame 2, but its own timeline starts at 0 and steps by 1/fps.
    expect(Array.from(run.channels[0].track.times)).toEqual([0, 0.1, 0.2].map((t) => expect.closeTo(t)));
    expect(run.duration).toBeCloseTo(0.2);
  });

  it('activates each frame’s own morph target within its clip and leaves the base frame all-zero', () => {
    const document = parseMd2(fiveFrameActions());
    const targetCount = 4;
    const stand = Array.from(document.animations[0].channels[0].track.values);
    // 'stand' keyframe 0 is base frame 0 → all weights zero; keyframe 1 is frame 1 → target 0 active.
    expect(stand.slice(0, targetCount)).toEqual([0, 0, 0, 0]);
    expect(stand.slice(targetCount, 2 * targetCount)).toEqual([1, 0, 0, 0]);
    // 'run' keyframes are frames 2,3,4 → targets 1,2,3 active on the diagonal, full width each.
    const run = Array.from(document.animations[1].channels[0].track.values);
    expect(run.slice(0, targetCount)).toEqual([0, 1, 0, 0]);
    expect(run.slice(targetCount, 2 * targetCount)).toEqual([0, 0, 1, 0]);
    expect(run.slice(2 * targetCount, 3 * targetCount)).toEqual([0, 0, 0, 1]);
  });

  it('collapses unnamed frames into a single default-named clip (MD2 without frame labels)', () => {
    const md2 = buildMd2({
      compressedVertices: singleTriangleFrame0,
      extraFrames: [
        [
          { normalIndex: 0, x: 0, y: 0, z: 5 },
          { normalIndex: 0, x: 1, y: 0, z: 5 },
          { normalIndex: 0, x: 0, y: 1, z: 5 },
        ],
      ],
      numFrames: 2,
      texCoords: singleTriangleTexCoords,
      triangles: singleTriangle,
    });
    const document = parseMd2(md2);
    expect(document.animations).toHaveLength(1);
    expect(document.animations[0].name).toBe('default');
  });

  it('disambiguates duplicate action names from two non-adjacent same-prefix runs', () => {
    const md2 = buildMd2({
      compressedVertices: singleTriangleFrame0,
      extraFrames: [
        [
          { normalIndex: 0, x: 0, y: 0, z: 1 },
          { normalIndex: 0, x: 1, y: 0, z: 1 },
          { normalIndex: 0, x: 0, y: 1, z: 1 },
        ],
        [
          { normalIndex: 0, x: 0, y: 0, z: 2 },
          { normalIndex: 0, x: 1, y: 0, z: 2 },
          { normalIndex: 0, x: 0, y: 1, z: 2 },
        ],
      ],
      // walk → jump → walk again: the two walk runs are not contiguous, so both clips are named 'walk'.
      frameNames: ['walk01', 'jump01', 'walk01'],
      numFrames: 3,
      texCoords: singleTriangleTexCoords,
      triangles: singleTriangle,
    });
    const document = parseMd2(md2);
    expect(document.animations.map((a) => a.name)).toEqual(['walk', 'jump', 'walk.2']);
  });
});

describe('MD2_ANORMS', () => {
  it('is the full 162-entry Quake 2 Anorms table', () => {
    expect(MD2_ANORMS).toHaveLength(162);
  });

  it('stores only unit-length normals', () => {
    for (const [x, y, z] of MD2_ANORMS) {
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 4);
    }
  });

  it('has no duplicate directions — each Anorms index is a distinct normal', () => {
    const distinct = new Set(MD2_ANORMS.map(([x, y, z]) => `${x},${y},${z}`));
    expect(distinct.size).toBe(162);
  });
});

describe('parseMd2', () => {
  it('decomposes a model into a single mesh node document with inline geometry', () => {
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 10, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 10, z: 0 },
      ],
      scale: [1, 1, 1],
      skin: 'players/hero/skin.pcx',
      texCoords: [{ s: 0, t: 0 }],
      translate: [0, 0, 0],
      triangles: [{ texIndices: [0, 0, 0], vertIndices: [0, 1, 2] }],
    });

    const document = parseMd2(md2);
    expect(document.meshes).toHaveLength(1);
    expect(getMeshGeometryVertexCount(document.meshes[0].geometry)).toBe(3);
    expect(document.nodes).toHaveLength(1);
    expect(document.nodes[0].mesh).toBe(0);
    expect(document.scenes[0].rootNodes).toEqual([0]);
    expect(document.resources).toHaveLength(1);
    expect(document.resources[0]).toBe((document.materials[0] as BlinnPhongMaterial).diffuseMap!.resource);
  });

  it('carries per-frame vertex animation as a weights channel bound to the mesh node index', () => {
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 10, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 10, z: 0 },
      ],
      extraFrames: [
        [
          { normalIndex: 0, x: 0, y: 0, z: 5 },
          { normalIndex: 0, x: 10, y: 0, z: 5 },
          { normalIndex: 0, x: 0, y: 10, z: 5 },
        ],
      ],
      numFrames: 2,
      scale: [1, 1, 1],
      texCoords: [{ s: 0, t: 0 }],
      translate: [0, 0, 0],
      triangles: [{ texIndices: [0, 0, 0], vertIndices: [0, 1, 2] }],
    });

    const document = parseMd2(md2);
    expect(document.meshes[0].morph).not.toBeNull();
    expect(document.animations).toHaveLength(1);
    expect(document.animations[0].channels[0].node).toBe(0);
  });

  it('returns an empty document (every table present) for malformed input', () => {
    const warnings: string[] = [];
    const document = parseMd2(new Uint8Array(10), warnings);
    expect(document.nodes).toEqual([]);
    expect(document.meshes).toEqual([]);
    expect(document.scenes).toEqual([{ rootNodes: [] }]);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
