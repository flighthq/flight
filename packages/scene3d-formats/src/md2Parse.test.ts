import {
  getMeshGeometryIndexCount,
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
  Scene3DAnimationTarget,
  Node3D,
} from '@flighthq/types/contract';
import { BlinnPhongMaterialKind } from '@flighthq/types/contract';

import { createScene3DFromMd2, parseMd2 } from './md2Parse';
import { MD2_ANORMS } from './md2Schema';
import { getTestTextureResource } from './scene3DFormatsTestHelper';

// Builds a minimal valid MD2 binary buffer with one frame and the given triangles, vertices, and
// texcoords. All offsets are computed from the data sizes.
function buildMd2(options: {
  compressedVertices: readonly { normalIndex: number; x: number; y: number; z: number }[];
  // Optional per-frame vertex data for frames 1..N (frame 0 always uses `compressedVertices`). When
  // omitted, extra frames are zero-filled. Length should be numFrames-1 when provided.
  extraFrames?: readonly (readonly { normalIndex: number; x: number; y: number; z: number }[])[];
  // Optional per-frame 16-byte name labels (index 0..numFrames-1). Omitted names stay all-null (empty).
  frameNames?: readonly string[];
  // Optional per-frame scale / translate overrides (index 0..numFrames-1); each falls back to the shared
  // `scale` / `translate` when absent. Used to exercise MD2's per-frame position requantization.
  frameScales?: readonly (readonly [number, number, number])[];
  frameTranslates?: readonly (readonly [number, number, number])[];
  magic?: number;
  numFrames?: number;
  scale?: readonly [number, number, number];
  skin?: string;
  // Multiple skin records (alternate textures). Takes precedence over `skin` when provided.
  skins?: readonly string[];
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
    frameScales = [],
    frameTranslates = [],
    magic = 0x32504449,
    numFrames = 1,
    scale = [1, 1, 1],
    skin,
    skins,
    skinHeight = 64,
    skinWidth = 64,
    texCoords,
    translate = [0, 0, 0],
    triangles,
    version = 8,
  } = options;

  const allSkins = skins ?? (skin !== undefined ? [skin] : []);
  const numVertices = compressedVertices.length;
  const numTexCoords = texCoords.length;
  const numTriangles = triangles.length;
  const numSkins = allSkins.length;

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

  // Skin records: each a 64-byte null-padded ASCII path.
  for (let s = 0; s < allSkins.length; s++) {
    const path = allSkins[s];
    for (let i = 0; i < path.length && i < 63; i++) bytes[offSkins + s * 64 + i] = path.charCodeAt(i);
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
  // uses `compressedVertices`; frames 1..N use `extraFrames` when supplied (zero-filled otherwise). Each
  // frame's scale/translate is `frameScales`/`frameTranslates` when given, else the shared scale/translate.
  for (let f = 0; f < numFrames; f++) {
    const frameBase = offFrames + f * frameSize;
    const fScale = frameScales[f] ?? scale;
    const fTranslate = frameTranslates[f] ?? translate;
    view.setFloat32(frameBase, fScale[0], true);
    view.setFloat32(frameBase + 4, fScale[1], true);
    view.setFloat32(frameBase + 8, fScale[2], true);
    view.setFloat32(frameBase + 12, fTranslate[0], true);
    view.setFloat32(frameBase + 16, fTranslate[1], true);
    view.setFloat32(frameBase + 20, fTranslate[2], true);
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

// Asserts EXACTLY ONE crumb of `kind` was recorded (guards the count) and returns it so a test can lock
// the full contract — severity, true origin, and detail — for that emitted diagnostic.
function expectOneCrumb(diagnostics: readonly ImportDiagnostic[], kind: string): ImportDiagnostic {
  const matches = diagnostics.filter((d) => d.kind === kind);
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe('createScene3DFromMd2', () => {
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

    const scene = createScene3DFromMd2(md2);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    // 3 unique vertex/texcoord combos, 6 indices (2 triangles).
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    expect(getMeshGeometryIndexCount(geometry)).toBe(6);
  });

  it('winds MD2 triangles CCW-front, checked against the AUTHORED normals rather than a centroid', () => {
    // MD2 is the only importer here carrying authored per-vertex normals (the Anorms LUT), which makes
    // this an independent ground truth rather than a heuristic. A centroid test would assume convexity —
    // organic models legitimately have inward-facing faces — so it cannot distinguish a winding defect
    // from ordinary concavity. This can.
    //
    // The synthetic triangle encodes MD2's convention explicitly instead of assuming the answer. Anorms[5]
    // is (0, 0, 1), so the authored outward direction is +Z in MD2 space; the vertices below are wound
    // CLOCKWISE as seen from +Z, since (v1−v0)×(v2−v0) = (0,0,−100) points AWAY from the authored normal.
    // That is the format's front-face winding, stated as a property of the data this test builds.
    //
    // Flight is counter-clockwise-front, and the Z-up→Y-up conversion (x, y, z) → (x, z, −y) is a
    // determinant-+1 ROTATION, so it cannot flip winding — the parser has to. Without the reversal the
    // face normal comes out anti-parallel to the authored normal and every front face is culled.
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 5, x: 0, y: 0, z: 0 },
        { normalIndex: 5, x: 0, y: 10, z: 0 },
        { normalIndex: 5, x: 10, y: 0, z: 0 },
      ],
      scale: [1, 1, 1],
      texCoords: [{ s: 0, t: 0 }],
      translate: [0, 0, 0],
      triangles: [{ texIndices: [0, 0, 0], vertIndices: [0, 1, 2] }],
    });

    const scene = createScene3DFromMd2(md2);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    const indices = Array.from(geometry.indices!);

    // The winding-derived face normal, from the indices as the renderer will read them.
    const p0 = { x: 0, y: 0, z: 0 };
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p0, geometry, indices[0]);
    getMeshGeometryVertexPosition(p1, geometry, indices[1]);
    getMeshGeometryVertexPosition(p2, geometry, indices[2]);
    const a = [p1.x - p0.x, p1.y - p0.y, p1.z - p0.z];
    const b = [p2.x - p0.x, p2.y - p0.y, p2.z - p0.z];
    const face = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

    // The authored normal, converted: Anorms[5] (0,0,1) → (0, 1, 0). Asserted as a value, not a sign, so
    // a defect in the Anorms conversion fails HERE rather than being absorbed by the dot product below.
    const authored = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexNormal(authored, geometry, indices[0]);
    expect(authored.x).toBeCloseTo(0, 5);
    expect(authored.y).toBeCloseTo(1, 5);
    expect(authored.z).toBeCloseTo(0, 5);

    // Correct winding agrees with the authored normal. A NEGATIVE dot is the defect this test exists for:
    // front faces culled, interior drawn, the model reading dark under lighting.
    const dot = face[0] * authored.x + face[1] * authored.y + face[2] * authored.z;
    expect(dot).toBeGreaterThan(0);

    // And the reversal is visible in the buffer itself, mirroring md5Parse.test.ts's assertion.
    expect(indices).toEqual([0, 2, 1]);
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

    const scene = createScene3DFromMd2(md2);
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

    const scene = createScene3DFromMd2(md2);
    const children = getNodeChildren(scene.root);
    expect(children).toHaveLength(1);
    expect(isMesh(children[0] as Node3D)).toBe(true);

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

    const scene = createScene3DFromMd2(md2);
    const mesh = getNodeChildren(scene.root)[0] as Mesh;
    expect(mesh.materials).toHaveLength(1);
    const material = mesh.materials[0] as BlinnPhongMaterial;
    expect(material.kind).toBe(BlinnPhongMaterialKind);
    expect(material.name).toBe('players/hero/skin.pcx'); // MD2 skin path preserved as the authored identity
    // The skin path is referenced, not decoded: an Unresolved External ref, image left null.
    expect((getTestTextureResource(scene.resources, material.diffuseMap!) as ExternalImageResourceReference).uri).toBe(
      'players/hero/skin.pcx',
    );
    expect(getTextureSource(material.diffuseMap!)).toBeNull();
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

    const mesh = getNodeChildren(createScene3DFromMd2(md2).root)[0] as Mesh;
    expect(mesh.materials).toHaveLength(0);
  });

  it('returns an empty scene for input shorter than the header', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromMd2(new Uint8Array(10), diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    const crumb = expectOneCrumb(diagnostics, 'md2.header-too-short');
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('parseMd2');
    expect(crumb.detail?.byteLength).toBe(10);
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

    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromMd2(md2, diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    const crumb = expectOneCrumb(diagnostics, 'md2.bad-magic');
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('parseMd2');
    expect(crumb.detail?.magic).toBe('12345678');
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

    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromMd2(md2, diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    const crumb = expectOneCrumb(diagnostics, 'md2.unsupported-version');
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('parseMd2');
    expect(crumb.detail?.version).toBe(99);
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
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromMd2(truncated, diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    const crumb = expectOneCrumb(diagnostics, 'md2.truncated-data-region');
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('parseMd2');
    expect(crumb.detail?.byteLength).toBe(70);
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

    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromMd2(md2, diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    const crumb = expectOneCrumb(diagnostics, 'md2.no-frames');
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('parseMd2');
    expect(crumb.detail).toBeUndefined();
  });

  it('reports a Reject diagnostic and yields an empty scene when the model declares no triangles', () => {
    const md2 = buildMd2({
      compressedVertices: [{ normalIndex: 0, x: 0, y: 0, z: 0 }],
      texCoords: [{ s: 0, t: 0 }],
      triangles: [], // numTriangles === 0 → the no-triangles reject (after the no-frames gate)
    });
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromMd2(md2, diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    const crumb = expectOneCrumb(diagnostics, 'md2.no-triangles');
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('parseMd2');
    expect(crumb.detail).toBeUndefined();
  });

  it('reports a Drop diagnostic when a skin record runs past the end of the buffer', () => {
    // Build a valid single-skin model, then point the skins offset (header field @44) near the end so the
    // skin record overruns — without disturbing the texcoord/triangle/frame regions the earlier
    // truncation gate checks, so the skin-record branch is what fires.
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 1, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 1, z: 0 },
      ],
      skin: 'players/hero.pcx',
      texCoords: [{ s: 0, t: 0 }],
      triangles: [{ texIndices: [0, 0, 0], vertIndices: [0, 1, 2] }],
    });
    new DataView(md2.buffer).setInt32(44, md2.length - 10, true); // offSkins past a full 64-byte skin record
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromMd2(md2, diagnostics);
    const crumb = expectOneCrumb(diagnostics, 'md2.skin-record-truncated');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseMd2');
    expect(crumb.detail?.skin).toBe(0);
  });

  it('reports a Drop diagnostic (aggregated) for skin records with an empty path', () => {
    // Two skin slots counted in numSkins but with all-null (empty) paths → no material, aggregated to one
    // crumb with a count.
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 1, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 1, z: 0 },
      ],
      skins: ['', ''],
      texCoords: [{ s: 0, t: 0 }],
      triangles: [{ texIndices: [0, 0, 0], vertIndices: [0, 1, 2] }],
    });
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromMd2(md2, diagnostics);
    const crumb = expectOneCrumb(diagnostics, 'md2.skin-empty-path');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseMd2');
    expect(crumb.detail?.count).toBe(2);
    expect(crumb.detail?.firstSkin).toBe(0);
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

    const scene = createScene3DFromMd2(md2);
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

    const scene = createScene3DFromMd2(md2);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    // 3 vertices * 2 texcoord variants = 6 unique vertices.
    expect(getMeshGeometryVertexCount(geometry)).toBe(6);
    expect(getMeshGeometryIndexCount(geometry)).toBe(6);
  });

  it('reports an aggregated Drop diagnostic for out-of-range vertex indices without crashing', () => {
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

    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromMd2(md2, diagnostics);
    // First triangle should still produce a mesh.
    expect(getNodeChildren(scene.root)).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'md2.triangle-vertex-index-out-of-range');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseMd2');
    expect(crumb.detail?.corners).toBe(1); // one out-of-range corner (index 99)
  });

  it('reports an aggregated Drop diagnostic for out-of-range texcoord indices without crashing', () => {
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

    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromMd2(md2, diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'md2.triangle-texcoord-index-out-of-range');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseMd2');
    expect(crumb.detail?.corners).toBe(1);
  });

  it('reports a Recover diagnostic (origin readMd2Frames) for an out-of-range vertex normal index, leaving that normal zero', () => {
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

    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromMd2(md2, diagnostics);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    const n = { x: 1, y: 1, z: 1 };
    getMeshGeometryVertexNormal(n, geometry, 0);
    expect(n).toEqual({ x: 0, y: 0, z: 0 });
    const crumb = expectOneCrumb(diagnostics, 'md2.normal-index-out-of-range');
    expect(crumb.severity).toBe('Recover'); // geometry survives; the normal is left zero
    expect(crumb.origin).toBe('readMd2Frames'); // the TRUE emitting helper, not the parseMd2 wrapper
    expect(crumb.detail?.firstIndex).toBe(200);
    expect(crumb.detail?.distinctIndices).toBe(1);
  });

  it('reports a Reject diagnostic and yields an empty scene when every triangle has out-of-range vertex indices', () => {
    // All three vertex indices of the only triangle are past the vertex count, so no valid index survives
    // and the model produces no geometry — the all-invalid branch, distinct from the aggregated per-corner Drop
    // (which keeps the valid triangles alongside it).
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 1, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 1, z: 0 },
      ],
      texCoords: [{ s: 0, t: 0 }],
      triangles: [{ texIndices: [0, 0, 0], vertIndices: [99, 98, 97] }],
    });
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromMd2(md2, diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    const crumb = expectOneCrumb(diagnostics, 'md2.no-valid-triangles');
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('parseMd2');
    expect(crumb.detail).toBeUndefined();
    // The same all-bad triangle also aggregates its 3 corners into one Drop crumb (origin parseMd2).
    const drop = expectOneCrumb(diagnostics, 'md2.triangle-vertex-index-out-of-range');
    expect(drop.severity).toBe('Drop');
    expect(drop.detail?.corners).toBe(3);
  });

  it('records NO diagnostics for a well-formed model even with a collector engaged', () => {
    // The seam fires only inside a drop branch, so a valid parse reaches none: the engaged collector
    // stays empty. (Without a collector the drop branches allocate nothing at all — the near-free path.)
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 1, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 1, z: 0 },
      ],
      texCoords: [{ s: 0, t: 0 }],
      triangles: [{ texIndices: [0, 0, 0], vertIndices: [0, 1, 2] }],
    });
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromMd2(md2, diagnostics);
    expect(diagnostics).toHaveLength(0);
  });

  it('aggregates out-of-range triangle corners into ONE Drop crumb carrying the count', () => {
    // One valid triangle keeps geometry alive; one all-out-of-range triangle contributes 3 bad vertex
    // corners — aggregated to a single Drop crumb (not three), per the hot-loop perf contract.
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 1, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 1, z: 0 },
      ],
      texCoords: [{ s: 0, t: 0 }],
      triangles: [
        { texIndices: [0, 0, 0], vertIndices: [0, 1, 2] },
        { texIndices: [0, 0, 0], vertIndices: [99, 98, 97] },
      ],
    });
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromMd2(md2, diagnostics);
    const drops = diagnostics.filter((d) => d.kind === 'md2.triangle-vertex-index-out-of-range');
    expect(drops).toHaveLength(1);
    expect(drops[0].severity).toBe('Drop');
    expect(drops[0].detail?.corners).toBe(3);
  });
});

describe('createScene3DFromMd2 animations', () => {
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
    const scene = createScene3DFromMd2(md2);
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
    const mesh = getNodeChildren(createScene3DFromMd2(md2).root)[0] as Mesh;
    expect(mesh.morph).not.toBeNull();
    expect(mesh.morph!.targets).toHaveLength(1);
    // The deduped vertex for source vertex 1 carries a +2 x position delta.
    const posDeltas = mesh.morph!.targets[0].positionDeltas;
    const hasShiftedVertex = Array.from({ length: posDeltas.length / 3 }, (_, v) => posDeltas[v * 3]).some(
      (dx) => Math.abs(dx - 2) < 1e-5,
    );
    expect(hasShiftedVertex).toBe(true);
  });

  it("applies each frame's own scale and translate when decompressing vertex positions", () => {
    // Frames 0 and 1 carry IDENTICAL compressed bytes; only frame 1's scale/translate differ. The morph
    // position delta must reflect frame 1's OWN requantization (x-byte 1 → 1*2+5=7 vs base 1*1+0=1 → +6),
    // proving the per-frame scale/translate is applied, not frame 0's reused for every frame (which → 0).
    const md2 = buildMd2({
      compressedVertices: singleTriangleFrame0,
      extraFrames: [singleTriangleFrame0.map((v) => ({ ...v }))],
      frameScales: [
        [1, 1, 1],
        [2, 1, 1],
      ],
      frameTranslates: [
        [0, 0, 0],
        [5, 0, 0],
      ],
      numFrames: 2,
      texCoords: singleTriangleTexCoords,
      triangles: singleTriangle,
    });
    const target = (getNodeChildren(createScene3DFromMd2(md2).root)[0] as Mesh).morph!.targets[0];
    const dxs = Array.from({ length: target.positionDeltas.length / 3 }, (_, v) => target.positionDeltas[v * 3]);
    expect(dxs.some((dx) => Math.abs(dx - 6) < 1e-5)).toBe(true);
  });

  it('records the per-frame normal delta on the morph target (frame normal minus base, Y-up)', () => {
    // Vertex 0 uses Anorms[0] in the base frame and Anorms[5] in frame 1; positions are unchanged, so only
    // its normalDelta is non-zero and must equal the Y-up-transformed difference of the two Anorms entries.
    const frame1 = [
      { normalIndex: 5, x: 0, y: 0, z: 0 },
      { normalIndex: 0, x: 1, y: 0, z: 0 },
      { normalIndex: 0, x: 0, y: 1, z: 0 },
    ];
    const md2 = buildMd2({
      compressedVertices: singleTriangleFrame0,
      extraFrames: [frame1],
      numFrames: 2,
      texCoords: singleTriangleTexCoords,
      triangles: singleTriangle,
    });
    const target = (getNodeChildren(createScene3DFromMd2(md2).root)[0] as Mesh).morph!.targets[0];
    const a0 = MD2_ANORMS[0];
    const a5 = MD2_ANORMS[5];
    // Y-up transform is (x, y, z) → (x, z, -y), so the per-component delta is (a5x-a0x, a5z-a0z, a0y-a5y).
    const expected = [a5[0] - a0[0], a5[2] - a0[2], a0[1] - a5[1]];
    const nd = target.normalDeltas!;
    const changed = Array.from({ length: nd.length / 3 }, (_, v) => v).find(
      (v) => Math.abs(nd[v * 3]) + Math.abs(nd[v * 3 + 1]) + Math.abs(nd[v * 3 + 2]) > 1e-6,
    );
    expect(changed).not.toBeUndefined();
    expect(nd[changed! * 3]).toBeCloseTo(expected[0], 5);
    expect(nd[changed! * 3 + 1]).toBeCloseTo(expected[1], 5);
    expect(nd[changed! * 3 + 2]).toBeCloseTo(expected[2], 5);
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
    const scene = createScene3DFromMd2(md2);
    expect(Object.keys(scene.animations)).toHaveLength(1);
    const clip = Object.values(scene.animations)[0];
    expect(clip.channels).toHaveLength(1);
    const channel = clip.channels[0];
    expect((channel.targetRef as Scene3DAnimationTarget).path).toBe('Weights');
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

  it('keeps off-diagonal weights zero across a single >2-frame clip (identity-diagonal hat function)', () => {
    // A 4-frame unnamed model → one 'default' clip, 3 morph targets. Each keyframe activates only its own
    // target: base row all-zero, then the identity diagonal. Asserts the FULL matrix, so any cross-talk
    // (a non-zero off-diagonal weight) in a >2-frame clip fails — the tighter check the 2-clip case can't make.
    const frame = (z: number) => [
      { normalIndex: 0, x: 0, y: 0, z },
      { normalIndex: 0, x: 1, y: 0, z },
      { normalIndex: 0, x: 0, y: 1, z },
    ];
    const md2 = buildMd2({
      compressedVertices: frame(0),
      extraFrames: [frame(1), frame(2), frame(3)],
      numFrames: 4,
      texCoords: singleTriangleTexCoords,
      triangles: singleTriangle,
    });
    const document = parseMd2(md2);
    expect(document.animations).toHaveLength(1);
    const track = document.animations[0].channels[0].track;
    expect(track.components).toBe(3);
    const values = Array.from(track.values);
    expect(values.slice(0, 3)).toEqual([0, 0, 0]);
    expect(values.slice(3, 6)).toEqual([1, 0, 0]);
    expect(values.slice(6, 9)).toEqual([0, 1, 0]);
    expect(values.slice(9, 12)).toEqual([0, 0, 1]);
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

    parseMd2(
      buildMd2({
        compressedVertices: [
          { normalIndex: 0, x: 0, y: 0, z: 0 },
          { normalIndex: 0, x: 10, y: 0, z: 0 },
          { normalIndex: 0, x: 0, y: 10, z: 0 },
        ],
        scale: [1, 1, 1],
        texCoords: [{ s: 0, t: 0 }],
        translate: [0, 0, 0],
        triangles: [{ texIndices: [0, 0, 0], vertIndices: [0, 1, 2] }],
      }),
      diagnostics,
    );

    const complaints = diagnostics.map((diagnostic) => diagnostic.kind);
    expect(complaints, `a good md2 file made the parser complain: ${complaints.join(', ')}`).toEqual([]);
  });

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
    expect(getTestTextureResource(document.resources, (document.materials[0] as BlinnPhongMaterial).diffuseMap!)).toBe(
      document.resources[0],
    );
  });

  it('emits every skin as a material and binds the first to the mesh', () => {
    const md2 = buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 10, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 10, z: 0 },
      ],
      skins: ['skins/red.pcx', 'skins/blue.pcx', 'skins/green.pcx'],
      texCoords: [{ s: 0, t: 0 }],
      triangles: [{ texIndices: [0, 0, 0], vertIndices: [0, 1, 2] }],
    });

    const document = parseMd2(md2);
    // All three alternate skins register as materials; the mesh's single subset binds the first.
    expect(document.materials).toHaveLength(3);
    expect((document.materials[0] as BlinnPhongMaterial).name).toBe('skins/red.pcx');
    expect((document.materials[1] as BlinnPhongMaterial).name).toBe('skins/blue.pcx');
    expect((document.materials[2] as BlinnPhongMaterial).name).toBe('skins/green.pcx');
    expect(document.meshes[0].materials).toEqual([0]);
    // One unresolved texture resource per skin.
    expect(document.resources).toHaveLength(3);
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
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseMd2(new Uint8Array(10), diagnostics);
    expect(document.nodes).toEqual([]);
    expect(document.meshes).toEqual([]);
    expect(document.scenes).toEqual([{ rootNodes: [] }]);
    // parseMd2 (not the createScene3DFromMd2 wrapper) is the true origin even on the document-returning path.
    const crumb = expectOneCrumb(diagnostics, 'md2.header-too-short');
    expect(crumb.severity).toBe('Reject');
    expect(crumb.origin).toBe('parseMd2');
    expect(crumb.detail?.byteLength).toBe(10);
  });
});

describe('parseMd2 read integrity', () => {
  // The fixture writes a self-consistent header, so each probe corrupts one field of a valid file — which
  // is exactly the shape a real malformed asset takes.
  function validMd2(): Uint8Array {
    return buildMd2({
      compressedVertices: [
        { normalIndex: 0, x: 0, y: 0, z: 0 },
        { normalIndex: 0, x: 10, y: 0, z: 0 },
        { normalIndex: 0, x: 0, y: 10, z: 0 },
      ],
      texCoords: [
        { s: 0, t: 0 },
        { s: 1, t: 0 },
        { s: 0, t: 1 },
      ],
      triangles: [{ texIndices: [0, 1, 2], vertIndices: [0, 1, 2] }],
    });
  }

  function corrupt(offset: number, value: number): Uint8Array {
    const bytes = validMd2();
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setInt32(offset, value, true);
    return bytes;
  }

  it('rejects a declared frame size that disagrees with the one implied by the vertex count', () => {
    // AXIS 9. The bound on the frame reads is `offFrames + numFrames * frameStride`, and `frameStride` is
    // derived from `numVertices` — the same input the per-frame ADDRESS uses. So if numVertices is wrong
    // the bound is wrong by exactly the amount needed to keep passing, and every frame after the first is
    // read from a drifting offset, decoding its neighbour's bytes as finite, plausible scale/translate
    // floats. `frameSize` at header offset 16 is the file's own independent statement of that stride, and
    // it is the only thing in the file that can catch this.
    const diagnostics: ImportDiagnostic[] = [];
    parseMd2(corrupt(16, 444), diagnostics);
    const crumb = diagnostics.find((d) => d.kind === 'md2.frame-size-mismatch');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe('Reject');
  });

  it('reports two sections that claim the same bytes', () => {
    // AXIS 10. MD2's sections are siblings that TILE the file, so no containment check at any depth sees
    // this — each region is individually inside the file. Pointing offFrames at the triangle block decodes
    // uint16 index pairs as float32 scale/translate, which are small and finite, and builds a complete
    // animated mesh out of them.
    const bytes = validMd2();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setInt32(56, view.getInt32(52, true), true); // offFrames := offTriangles
    const diagnostics: ImportDiagnostic[] = [];
    parseMd2(bytes, diagnostics);
    expect(diagnostics.find((d) => d.kind === 'md2.section-overlap')).toBeDefined();
  });

  it('rejects a negative offset rather than reading before the region or fabricating from undefined', () => {
    // AXIS 2. A negative offset passes every upper-bound test — the read simply starts earlier. Through
    // DataView it throws; through raw byte indexing it yields `undefined`, and `offSkins` turned that into
    // a fabricated 64-NUL material name with a matching texture path and no diagnostic at all.
    for (const offset of [44, 48, 52, 56]) {
      const diagnostics: ImportDiagnostic[] = [];
      expect(() => parseMd2(corrupt(offset, -64), diagnostics)).not.toThrow();
      expect(diagnostics.find((d) => d.kind === 'md2.negative-header-field')).toBeDefined();
    }
  });

  it('rejects a negative count rather than throwing out of the typed-array allocation', () => {
    for (const offset of [24, 28, 20]) {
      const diagnostics: ImportDiagnostic[] = [];
      expect(() => parseMd2(corrupt(offset, -3), diagnostics)).not.toThrow();
      expect(diagnostics.find((d) => d.kind === 'md2.negative-header-field')).toBeDefined();
    }
  });

  it('reports a declared file size that disagrees with the bytes actually supplied', () => {
    // The file's second independent anchor. Nothing else in the header can reveal that the header and the
    // bytes describe different files.
    const diagnostics: ImportDiagnostic[] = [];
    parseMd2(corrupt(64, 999999), diagnostics);
    const crumb = diagnostics.find((d) => d.kind === 'md2.file-size-mismatch');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe('Recover');
  });

  it('stays quiet for a well-formed file', () => {
    const diagnostics: ImportDiagnostic[] = [];
    parseMd2(validMd2(), diagnostics);
    expect(diagnostics).toHaveLength(0);
  });
});
