import { sampleAnimationTrack } from '@flighthq/animation/contract';
import { linearChannelToSrgb } from '@flighthq/color/contract';
import {
  getMeshGeometryIndexCount,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexTangent,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh/contract';
import { getNodeChildren, getNodeLocalMatrix4 } from '@flighthq/node/contract';
import { isMesh } from '@flighthq/scene3d/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type {
  EmbeddedImageResourceReference,
  ExternalImageResourceReference,
  ImportDiagnostic,
  Mesh,
  Scene3DAnimationTarget,
  Node3D,
  StandardPbrMaterial,
  GltfDocument,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, StandardPbrMaterialKind } from '@flighthq/types/contract';

import {
  createScene3DFromGlb,
  createScene3DFromGltf,
  createScene3DsFromGlb,
  createScene3DsFromGltf,
  parseGlb,
  parseGltf,
} from './gltfParse';
import { getTestTextureResource } from './scene3DFormatsTestHelper';

function findGltfDiagnostic(diagnostics: readonly ImportDiagnostic[], kind: string): ImportDiagnostic | undefined {
  return diagnostics.find((diagnostic) => diagnostic.kind === kind);
}

// A base64 `data:` URI carrying `bytes` under an explicit image MIME type.
function imageDataUri(mimeType: string, bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mimeType};base64,${btoa(binary)}`;
}

// Concatenates raw byte segments into one buffer and returns its base64 `data:` URI.
function toDataUri(...segments: readonly Uint8Array[]): string {
  let total = 0;
  for (const segment of segments) total += segment.length;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const segment of segments) {
    bytes.set(segment, offset);
    offset += segment.length;
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:application/octet-stream;base64,${btoa(binary)}`;
}

// Wraps a glTF document plus a binary buffer into a `.glb` container (header + JSON chunk + BIN chunk).
function buildGlb(doc: Readonly<GltfDocument>, binary: Readonly<Uint8Array>): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(doc));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunkLength = jsonBytes.length + jsonPad;
  const binPad = (4 - (binary.length % 4)) % 4;
  const binChunkLength = binary.length + binPad;
  const total = 12 + 8 + jsonChunkLength + 8 + binChunkLength;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // magic 'glTF'
  view.setUint32(4, 2, true); // version
  view.setUint32(8, total, true); // total length

  let o = 12;
  view.setUint32(o, jsonChunkLength, true);
  view.setUint32(o + 4, 0x4e4f534a, true); // 'JSON'
  o += 8;
  out.set(jsonBytes, o);
  for (let i = 0; i < jsonPad; i++) out[o + jsonBytes.length + i] = 0x20; // JSON chunk pads with spaces
  o += jsonChunkLength;

  view.setUint32(o, binChunkLength, true);
  view.setUint32(o + 4, 0x004e4942, true); // 'BIN\0'
  o += 8;
  out.set(binary, o); // BIN chunk pads with zeros (already zeroed)
  return out;
}

function bytesOf(...arrays: readonly ArrayBufferView[]): Uint8Array {
  let total = 0;
  for (const a of arrays) total += a.byteLength;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    bytes.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), offset);
    offset += a.byteLength;
  }
  return bytes;
}

// A one-node glTF whose single animation channel drives `path` from a sampler with the given output
// payload and interpolation. Used to exercise the sampler paths/interpolations with SCHEMA-VALID payloads
// (VEC3 for translation/scale, VEC4 for rotation; CUBICSPLINE supplies 3 elements — in-tangent/value/
// out-tangent — per keyframe) so the resulting Flight track can be SAMPLED to prove correct decoding.
function makeChannelGltf(opts: {
  interpolation: 'CUBICSPLINE' | 'LINEAR' | 'STEP';
  output: Float32Array;
  outputCount: number;
  outputType: 'VEC3' | 'VEC4';
  path: 'rotation' | 'scale' | 'translation';
  times: Float32Array;
}): GltfDocument {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const uri = toDataUri(bytesOf(positions), bytesOf(opts.times), bytesOf(opts.output));
  const posLen = positions.byteLength;
  const timesLen = opts.times.byteLength;
  return {
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: opts.times.length, type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: opts.outputCount, type: opts.outputType },
    ],
    animations: [
      {
        channels: [{ sampler: 0, target: { node: 0, path: opts.path } }],
        samplers: [{ input: 1, interpolation: opts.interpolation, output: 2 }],
      },
    ],
    asset: { version: '2.0' },
    bufferViews: [
      { buffer: 0, byteLength: posLen, byteOffset: 0 },
      { buffer: 0, byteLength: timesLen, byteOffset: posLen },
      { buffer: 0, byteLength: opts.output.byteLength, byteOffset: posLen + timesLen },
    ],
    buffers: [{ byteLength: posLen + timesLen + opts.output.byteLength, uri }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scene: 0,
    scenes: [{ nodes: [0] }],
  };
}

// A single triangle (3 positions) with a ushort index buffer, embedded as a base64 data URI, on a node
// translated to (5, 0, 0).
function makeTriangleGltf(): GltfDocument {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const uri = toDataUri(bytesOf(positions), bytesOf(indices));

  return {
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    asset: { version: '2.0' },
    bufferViews: [
      { buffer: 0, byteLength: positions.byteLength, byteOffset: 0 },
      { buffer: 0, byteLength: indices.byteLength, byteOffset: positions.byteLength },
    ],
    buffers: [{ byteLength: positions.byteLength + indices.byteLength, uri }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes: [{ mesh: 0, translation: [5, 0, 0] }],
    scene: 0,
    scenes: [{ nodes: [0] }],
  };
}

// makeTriangleGltf plus a TEXCOORD_0 stream — the minimum a tangent basis can be derived from.
function makeUvTriangleGltf(): GltfDocument {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const uvs = new Float32Array([0, 0, 1, 0, 0, 1]);
  const indices = new Uint16Array([0, 1, 2]);
  const uri = toDataUri(bytesOf(positions), bytesOf(uvs), bytesOf(indices));

  return {
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' },
      { bufferView: 2, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    asset: { version: '2.0' },
    bufferViews: [
      { buffer: 0, byteLength: positions.byteLength, byteOffset: 0 },
      { buffer: 0, byteLength: uvs.byteLength, byteOffset: positions.byteLength },
      { buffer: 0, byteLength: indices.byteLength, byteOffset: positions.byteLength + uvs.byteLength },
    ],
    buffers: [{ byteLength: positions.byteLength + uvs.byteLength + indices.byteLength, uri }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2 }] }],
    nodes: [{ mesh: 0 }],
    scene: 0,
    scenes: [{ nodes: [0] }],
  };
}

// A two-node parent-child scene: node 0 is a plain container (children:[1]), node 1 is a mesh node
// with positions-only geometry (no indices).
function makeParentChildGltf(): GltfDocument {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const uri = toDataUri(bytesOf(positions));

  return {
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    asset: { version: '2.0' },
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength, byteOffset: 0 }],
    buffers: [{ byteLength: positions.byteLength, uri }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ children: [1] }, { mesh: 0 }],
    scene: 0,
    scenes: [{ nodes: [0] }],
  };
}

// A skinned single-triangle mesh: node 0 instances mesh 0 with skin 0; node 1 is the lone joint.
// JOINTS_0 (ubyte VEC4) and WEIGHTS_0 (float VEC4) weight every vertex fully to joint 0, and the skin
// supplies an identity inverse-bind matrix. `inverseBind` false omits inverseBindMatrices to exercise
// the spec's identity default.
function makeSkinnedGltf(inverseBind = true): GltfDocument {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const joints = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const weights = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  const ibm = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const uri = toDataUri(bytesOf(positions), bytesOf(joints), bytesOf(weights), bytesOf(ibm));

  const positionsLen = positions.byteLength;
  const jointsLen = joints.byteLength;
  const weightsLen = weights.byteLength;
  const doc: GltfDocument = {
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5121, count: 3, type: 'VEC4' },
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC4' },
      { bufferView: 3, componentType: 5126, count: 1, type: 'MAT4' },
    ],
    asset: { version: '2.0' },
    bufferViews: [
      { buffer: 0, byteLength: positionsLen, byteOffset: 0 },
      { buffer: 0, byteLength: jointsLen, byteOffset: positionsLen },
      { buffer: 0, byteLength: weightsLen, byteOffset: positionsLen + jointsLen },
      { buffer: 0, byteLength: ibm.byteLength, byteOffset: positionsLen + jointsLen + weightsLen },
    ],
    buffers: [{ byteLength: positionsLen + jointsLen + weightsLen + ibm.byteLength, uri }],
    meshes: [{ primitives: [{ attributes: { JOINTS_0: 1, POSITION: 0, WEIGHTS_0: 2 } }] }],
    nodes: [
      { mesh: 0, skin: 0 },
      { name: 'joint', translation: [0, 0, 0] },
    ],
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    skins: [inverseBind ? { inverseBindMatrices: 3, joints: [1] } : { joints: [1] }],
  };
  return doc;
}

// A single-triangle mesh carrying one morph target (POSITION + NORMAL deltas) and a weights animation
// channel driving it from 0 → 1 over t∈[0,1]. mesh.weights seeds the initial weight.
function makeMorphGltf(): GltfDocument {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const posDeltas = new Float32Array([0, 10, 0, 0, 10, 0, 0, 10, 0]);
  const nrmDeltas = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]);
  const times = new Float32Array([0, 1]);
  const weightValues = new Float32Array([0, 1]); // 1 target → 1 weight per keyframe
  const uri = toDataUri(
    bytesOf(positions),
    bytesOf(normals),
    bytesOf(posDeltas),
    bytesOf(nrmDeltas),
    bytesOf(times),
    bytesOf(weightValues),
  );
  let o = 0;
  const view = (len: number) => {
    const bv = { buffer: 0, byteLength: len, byteOffset: o };
    o += len;
    return bv;
  };

  return {
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }, // 0 base position
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' }, // 1 base normal
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC3' }, // 2 position deltas
      { bufferView: 3, componentType: 5126, count: 3, type: 'VEC3' }, // 3 normal deltas
      { bufferView: 4, componentType: 5126, count: 2, type: 'SCALAR' }, // 4 times
      { bufferView: 5, componentType: 5126, count: 2, type: 'SCALAR' }, // 5 weight values
    ],
    animations: [
      {
        channels: [{ sampler: 0, target: { node: 0, path: 'weights' } }],
        name: 'blink',
        samplers: [{ input: 4, interpolation: 'LINEAR', output: 5 }],
      },
    ],
    asset: { version: '2.0' },
    bufferViews: [
      view(positions.byteLength),
      view(normals.byteLength),
      view(posDeltas.byteLength),
      view(nrmDeltas.byteLength),
      view(times.byteLength),
      view(weightValues.byteLength),
    ],
    buffers: [{ byteLength: o, uri }],
    meshes: [
      {
        primitives: [{ attributes: { NORMAL: 1, POSITION: 0 }, targets: [{ NORMAL: 3, POSITION: 2 }] }],
        weights: [0],
      },
    ],
    nodes: [{ mesh: 0 }],
    scene: 0,
    scenes: [{ nodes: [0] }],
  };
}

describe('createScene3DFromGlb', () => {
  it('imports geometry from a GLB container whose buffer is backed by the BIN chunk', () => {
    const positions = new Float32Array([7, 8, 9, 1, 0, 0, 0, 1, 0]);
    const binary = bytesOf(positions);
    const doc: GltfDocument = {
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      asset: { version: '2.0' },
      // A GLB buffer references the BIN chunk by omitting `uri`.
      bufferViews: [{ buffer: 0, byteLength: positions.byteLength, byteOffset: 0 }],
      buffers: [{ byteLength: positions.byteLength }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const scene = createScene3DFromGlb(buildGlb(doc, binary));

    const meshNode = getNodeChildren(scene.root)[0] as Node3D;
    expect(isMesh(meshNode)).toBe(true);
    const geometry = (meshNode as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    const p = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 0);
    expect([p.x, p.y, p.z]).toEqual([7, 8, 9]);
  });

  it('returns an empty scene and warns when the magic is not glTF', () => {
    const bogus = new Uint8Array(16);
    bogus[0] = 0x00;
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGlb(bogus, diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    const crumb = findGltfDiagnostic(diagnostics, 'glb.wrong-magic');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Reject);
    expect(crumb!.origin).toBe('readGlbContainer');
  });

  it('returns an empty scene and warns when the byte length is below the header size', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGlb(new Uint8Array(4), diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('returns an empty scene and warns for an unsupported GLB container version', () => {
    // A well-formed glTF-magic container whose header version is 3 (not 2) must be rejected by version.
    const glb = buildGlb(makeTriangleGltf(), new Uint8Array(0));
    new DataView(glb.buffer).setUint32(4, 3, true); // header version 2 → 3
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGlb(glb, diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    const crumb = findGltfDiagnostic(diagnostics, 'glb.unsupported-version');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Reject);
    expect(crumb!.origin).toBe('readGlbContainer');
    expect(crumb!.detail?.version).toBe(3);
  });

  it('returns an empty scene and warns when the GLB JSON chunk is not valid JSON', () => {
    // Corrupt the first JSON byte (the leading '{' at offset 20 = 12 header + 8 chunk header) so JSON.parse
    // throws — the container is otherwise well-formed, exercising the malformed-JSON branch, not the magic one.
    const glb = buildGlb(makeTriangleGltf(), new Uint8Array(0));
    glb[20] = 0x78; // 'x'
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGlb(glb, diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    const crumb = findGltfDiagnostic(diagnostics, 'glb.json-chunk-invalid');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Reject);
    expect(crumb!.origin).toBe('readGlbContainer');
  });
});

describe('createScene3DFromGltf', () => {
  it('decodes a glTF material to a StandardPbrMaterial carrying its metallic-roughness factors', () => {
    const doc = makeTriangleGltf();
    doc.materials = [
      {
        alphaCutoff: 0.3,
        alphaMode: 'MASK',
        doubleSided: true,
        emissiveFactor: [0, 1, 0],
        name: 'Canopy',
        pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1], metallicFactor: 0.25, roughnessFactor: 0.75 },
      },
    ];
    doc.meshes![0].primitives[0].material = 0;

    const mesh = getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh;
    expect(mesh.materials).toHaveLength(1);
    const mat = mesh.materials[0] as StandardPbrMaterial;
    expect(mat.kind).toBe(StandardPbrMaterialKind);
    // 0/1 factors are sRGB-encoding fixed points (srgb(0)==0, srgb(1)==1), so the packed bytes match.
    expect(mat.baseColor).toBe(0xff0000ff);
    expect(mat.emissive).toBe(0x00ff00ff); // emissiveFactor widened to opaque
    expect(mat.metallic).toBe(0.25);
    expect(mat.roughness).toBe(0.75);
    expect(mat.alphaMode).toBe('mask');
    expect(mat.alphaCutoff).toBe(0.3);
    expect(mat.doubleSided).toBe(true);
    expect(mat.name).toBe('Canopy'); // glTF material.name preserved as the authored identity
  });

  it('sRGB-encodes a mid-range linear baseColorFactor so the shader gamma-decode recovers it', () => {
    // glTF factors are LINEAR; StandardPbrMaterial.baseColor is packed sRGB (scene-gl gamma-decodes it),
    // so a linear 0.5 must pack as its sRGB byte (~0.735 → 0xbb), NOT as 0.5→0x80. Packing raw would
    // gamma-decode a second time in the shader and darken the material.
    const doc = makeTriangleGltf();
    doc.materials = [
      { emissiveFactor: [0.5, 0.5, 0.5], pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1] } },
    ];
    doc.meshes![0].primitives[0].material = 0;

    const scene = createScene3DFromGltf(doc);
    const mat = (getNodeChildren(scene.root)[0] as Mesh).materials[0] as StandardPbrMaterial;
    const srgbByte = Math.round(linearChannelToSrgb(0.5) * 0xff);
    const expected = ((srgbByte << 24) | (srgbByte << 16) | (srgbByte << 8)) >>> 0;
    expect(mat.baseColor).toBe((expected | 0xff) >>> 0);
    expect(mat.emissive).toBe((expected | 0xff) >>> 0);
    expect(srgbByte).not.toBe(0x80); // proves a non-trivial encode happened
  });

  it('applies glTF metallic-roughness spec defaults when factors are absent', () => {
    const doc = makeTriangleGltf();
    doc.materials = [{}];
    doc.meshes![0].primitives[0].material = 0;

    const scene = createScene3DFromGltf(doc);
    const mat = (getNodeChildren(scene.root)[0] as Mesh).materials[0] as StandardPbrMaterial;
    expect(mat.baseColor).toBe(0xffffffff); // default [1,1,1,1]
    expect(mat.metallic).toBe(1);
    expect(mat.roughness).toBe(1);
    expect(mat.alphaMode).toBe('opaque');
    expect(mat.name).toBeNull(); // no material.name → anonymous
  });

  it('resolves a baseColorTexture data-URI image to an Embedded texture ref', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const doc = makeTriangleGltf();
    doc.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }];
    doc.textures = [{ source: 0 }];
    doc.images = [{ uri: imageDataUri('image/png', png) }];
    doc.meshes![0].primitives[0].material = 0;

    const scene = createScene3DFromGltf(doc);
    const mat = (getNodeChildren(scene.root)[0] as Mesh).materials[0] as StandardPbrMaterial;
    expect(getTextureSource(mat.baseColorMap!)).toBeNull();
    const ref = getTestTextureResource(scene.resources, mat.baseColorMap!) as EmbeddedImageResourceReference;
    expect(ref.kind).toBe('Embedded');
    expect(ref.mimeType).toBe('image/png');
    expect(Array.from(ref.bytes)).toEqual(Array.from(png));
  });

  it('lists each glTF image resource once and shares its identity across independently sampled textures', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const doc = makeTriangleGltf();
    doc.materials = [
      {
        normalTexture: { index: 1 },
        pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
      },
    ];
    doc.textures = [
      { sampler: 0, source: 0 },
      { sampler: 1, source: 0 },
    ];
    doc.samplers = [{ wrapS: 10497 }, { wrapS: 33071 }];
    doc.images = [{ uri: imageDataUri('image/png', png) }];
    doc.meshes![0].primitives[0].material = 0;

    const parsed = parseGltf(doc);
    const material = parsed.materials[0] as StandardPbrMaterial;
    expect(parsed.resources).toHaveLength(1);
    expect(material.baseColorMap).not.toBe(material.normalMap);
    expect(getTestTextureResource(parsed.resources, material.baseColorMap!)).toBe(parsed.resources[0]);
    expect(getTestTextureResource(parsed.resources, material.normalMap!)).toBe(parsed.resources[0]);
    expect(material.baseColorMap!.colorSpace).toBe('srgb');
    expect(material.normalMap!.colorSpace).toBe('linear');
    expect(material.baseColorMap!.sampler.wrapU).toBe('repeat');
    expect(material.normalMap!.sampler.wrapU).toBe('clamp-to-edge');
  });

  it('resolves an external-URI image to an External texture ref', () => {
    const doc = makeTriangleGltf();
    doc.materials = [{ emissiveTexture: { index: 0 } }];
    doc.textures = [{ source: 0 }];
    doc.images = [{ uri: 'textures/emissive.png' }];
    doc.meshes![0].primitives[0].material = 0;

    const scene = createScene3DFromGltf(doc);
    const mat = (getNodeChildren(scene.root)[0] as Mesh).materials[0] as StandardPbrMaterial;
    const ref = getTestTextureResource(scene.resources, mat.emissiveMap!) as ExternalImageResourceReference;
    expect(ref.kind).toBe('External');
    expect(ref.uri).toBe('textures/emissive.png');
  });

  it('resolves a bufferView-embedded image to an Embedded texture ref and honors normalScale', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 7, 7, 7]);
    const doc: GltfDocument = {
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      asset: { version: '2.0' },
      bufferViews: [
        { buffer: 0, byteLength: positions.byteLength, byteOffset: 0 },
        { buffer: 1, byteLength: png.length, byteOffset: 0 },
      ],
      buffers: [
        { byteLength: positions.byteLength, uri: toDataUri(bytesOf(positions)) },
        { byteLength: png.length, uri: toDataUri(png) },
      ],
      images: [{ bufferView: 1, mimeType: 'image/png' }],
      materials: [{ normalTexture: { index: 0, scale: 2 } }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
      textures: [{ source: 0 }],
    };

    const scene = createScene3DFromGltf(doc);
    const mat = (getNodeChildren(scene.root)[0] as Mesh).materials[0] as StandardPbrMaterial;
    expect(mat.normalScale).toBe(2);
    const ref = getTestTextureResource(scene.resources, mat.normalMap!) as EmbeddedImageResourceReference;
    expect(ref.kind).toBe('Embedded');
    expect(ref.mimeType).toBe('image/png');
    expect(Array.from(ref.bytes)).toEqual(Array.from(png));
  });

  it('leaves a primitive unmaterialed when it references no material', () => {
    const mesh = getNodeChildren(createScene3DFromGltf(makeTriangleGltf()).root)[0] as Mesh;
    expect(mesh.materials).toHaveLength(0);
  });

  it('resolves pbrMetallicRoughness.metallicRoughnessTexture to a linear metallicRoughnessMap', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const doc = makeTriangleGltf();
    doc.materials = [{ pbrMetallicRoughness: { metallicRoughnessTexture: { index: 0 } } }];
    doc.textures = [{ source: 0 }];
    doc.images = [{ uri: imageDataUri('image/png', png) }];
    doc.meshes![0].primitives[0].material = 0;

    const scene = createScene3DFromGltf(doc);
    const mat = (getNodeChildren(scene.root)[0] as Mesh).materials[0] as StandardPbrMaterial;
    expect(mat.metallicRoughnessMap).not.toBeNull();
    expect(mat.metallicRoughnessMap!.colorSpace).toBe('linear'); // metallic/roughness is data, not color
    expect(
      (getTestTextureResource(scene.resources, mat.metallicRoughnessMap!) as EmbeddedImageResourceReference).mimeType,
    ).toBe('image/png');
  });

  it('reads occlusionTexture into a linear occlusionMap and honors occlusionStrength', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 4]);
    const doc = makeTriangleGltf();
    doc.materials = [{ occlusionTexture: { index: 0, strength: 0.5 } }];
    doc.textures = [{ source: 0 }];
    doc.images = [{ uri: imageDataUri('image/png', png) }];
    doc.meshes![0].primitives[0].material = 0;

    const mat = (getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh).materials[0] as StandardPbrMaterial;
    expect(mat.occlusionStrength).toBe(0.5);
    expect(mat.occlusionMap).not.toBeNull();
    expect(mat.occlusionMap!.colorSpace).toBe('linear');
  });

  it('maps alphaMode BLEND to blend coverage', () => {
    const doc = makeTriangleGltf();
    doc.materials = [{ alphaMode: 'BLEND', pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 0.5] } }];
    doc.meshes![0].primitives[0].material = 0;

    const mat = (getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh).materials[0] as StandardPbrMaterial;
    expect(mat.alphaMode).toBe('blend');
  });

  it('maps a glTF sampler onto the texture wrap and filter state', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 5, 5]);
    const doc = makeTriangleGltf();
    doc.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }];
    doc.textures = [{ sampler: 0, source: 0 }];
    // REPEAT wrapS, MIRRORED_REPEAT wrapT, NEAREST mag, LINEAR_MIPMAP_LINEAR min.
    doc.samplers = [{ magFilter: 9728, minFilter: 9987, wrapS: 10497, wrapT: 33648 }];
    doc.images = [{ uri: imageDataUri('image/png', png) }];
    doc.meshes![0].primitives[0].material = 0;

    const map = ((getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh).materials[0] as StandardPbrMaterial)
      .baseColorMap!;
    expect(map.sampler.wrapU).toBe('repeat');
    expect(map.sampler.wrapV).toBe('mirror-repeat');
    expect(map.sampler.magFilter).toBe('nearest');
    expect(map.sampler.minFilter).toBe('linear-mipmap-linear');
    expect(map.sampler.mipmaps).toBe(true);
  });

  it('clears sampler mipmaps for a non-mip min filter', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 6]);
    const doc = makeTriangleGltf();
    doc.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }];
    doc.textures = [{ sampler: 0, source: 0 }];
    doc.samplers = [{ minFilter: 9729 }]; // LINEAR (no mip)
    doc.images = [{ uri: imageDataUri('image/png', png) }];
    doc.meshes![0].primitives[0].material = 0;

    const map = ((getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh).materials[0] as StandardPbrMaterial)
      .baseColorMap!;
    expect(map.sampler.minFilter).toBe('linear');
    expect(map.sampler.mipmaps).toBe(false);
  });

  it('marks a color map srgb and a data map linear', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 8]);
    const doc = makeTriangleGltf();
    doc.materials = [{ normalTexture: { index: 0 }, pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }];
    doc.textures = [{ source: 0 }];
    doc.images = [{ uri: imageDataUri('image/png', png) }];
    doc.meshes![0].primitives[0].material = 0;

    const mat = (getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh).materials[0] as StandardPbrMaterial;
    expect(mat.baseColorMap!.colorSpace).toBe('srgb');
    expect(mat.normalMap!.colorSpace).toBe('linear');
  });

  it('applies a KHR_texture_transform onto the texture uv fields', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9]);
    const doc = makeTriangleGltf();
    doc.materials = [
      {
        pbrMetallicRoughness: {
          baseColorTexture: {
            extensions: { KHR_texture_transform: { offset: [0.25, 0.5], rotation: 1.5, scale: [2, 4] } },
            index: 0,
          },
        },
      },
    ];
    doc.textures = [{ source: 0 }];
    doc.images = [{ uri: imageDataUri('image/png', png) }];
    doc.meshes![0].primitives[0].material = 0;

    const map = ((getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh).materials[0] as StandardPbrMaterial)
      .baseColorMap!;
    expect([map.uvOffset.x, map.uvOffset.y]).toEqual([0.25, 0.5]);
    expect(map.uvRotation).toBe(1.5);
    expect([map.uvScale.x, map.uvScale.y]).toEqual([2, 4]);
  });

  it('carries options.basePath onto an external-URI image ref', () => {
    const doc = makeTriangleGltf();
    doc.materials = [{ emissiveTexture: { index: 0 } }];
    doc.textures = [{ source: 0 }];
    doc.images = [{ uri: 'textures/emissive.png' }];
    doc.meshes![0].primitives[0].material = 0;

    const scene = createScene3DFromGltf(doc, undefined, { basePath: 'assets/models' });
    const mat = (getNodeChildren(scene.root)[0] as Mesh).materials[0] as StandardPbrMaterial;
    const ref = getTestTextureResource(scene.resources, mat.emissiveMap!) as ExternalImageResourceReference;
    expect(ref.uri).toBe('textures/emissive.png');
    expect(ref.basePath).toBe('assets/models');
  });

  it('reads geometry from an external buffer supplied via options.externalBuffers', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const doc: GltfDocument = {
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      asset: { version: '2.0' },
      bufferViews: [{ buffer: 0, byteLength: positions.byteLength, byteOffset: 0 }],
      buffers: [{ byteLength: positions.byteLength, uri: 'model.bin' }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const externalBuffers = { 'model.bin': bytesOf(positions) };

    const geometry = (getNodeChildren(createScene3DFromGltf(doc, undefined, { externalBuffers }).root)[0] as Mesh)
      .geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    const p = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 1);
    expect([p.x, p.y, p.z]).toEqual([1, 0, 0]);
  });

  it('warns and drops the mesh for an unsupplied external buffer', () => {
    const doc: GltfDocument = {
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      asset: { version: '2.0' },
      bufferViews: [{ buffer: 0, byteLength: 36, byteOffset: 0 }],
      buffers: [{ byteLength: 36, uri: 'missing.bin' }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const diagnostics: ImportDiagnostic[] = [];

    // The empty buffer yields a 0-vertex POSITION accessor, so the primitive is dropped and no mesh is emitted.
    const node = getNodeChildren(createScene3DFromGltf(doc, diagnostics).root)[0] as Node3D;
    expect(isMesh(node)).toBe(false);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.buffer-empty');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstUri).toBe('missing.bin');
  });

  it('applies a sparse accessor override on top of the base values', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const sparseIndices = new Uint16Array([1]); // override vertex 1
    const sparseValues = new Float32Array([9, 9, 9]);
    const posLen = positions.byteLength;
    const idxLen = sparseIndices.byteLength;
    const doc: GltfDocument = {
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          sparse: { count: 1, indices: { bufferView: 1, componentType: 5123 }, values: { bufferView: 2 } },
          type: 'VEC3',
        },
      ],
      asset: { version: '2.0' },
      bufferViews: [
        { buffer: 0, byteLength: posLen, byteOffset: 0 },
        { buffer: 0, byteLength: idxLen, byteOffset: posLen },
        { buffer: 0, byteLength: sparseValues.byteLength, byteOffset: posLen + idxLen },
      ],
      buffers: [
        {
          byteLength: posLen + idxLen + sparseValues.byteLength,
          uri: toDataUri(bytesOf(positions), bytesOf(sparseIndices), bytesOf(sparseValues)),
        },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };

    const geometry = (getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh).geometry;
    const p = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 0);
    expect([p.x, p.y, p.z]).toEqual([0, 0, 0]);
    getMeshGeometryVertexPosition(p, geometry, 1);
    expect([p.x, p.y, p.z]).toEqual([9, 9, 9]); // overridden by the sparse block
    getMeshGeometryVertexPosition(p, geometry, 2);
    expect([p.x, p.y, p.z]).toEqual([0, 1, 0]);
  });

  it('accepts a JSON string as well as a parsed object', () => {
    const scene = createScene3DFromGltf(JSON.stringify(makeTriangleGltf()));
    expect(getNodeChildren(scene.root)).toHaveLength(1);
  });

  it('builds the correct hierarchy for a 2-node parent-child scene', () => {
    const scene = createScene3DFromGltf(makeParentChildGltf());

    const roots = getNodeChildren(scene.root);
    expect(roots).toHaveLength(1);

    const node0 = roots[0] as Node3D;
    expect(isMesh(node0)).toBe(false);

    const node0Children = getNodeChildren(node0);
    expect(node0Children).toHaveLength(1);

    const node1 = node0Children[0] as Node3D;
    expect(isMesh(node1)).toBe(true);
  });

  it('builds the node hierarchy with the imported mesh and transform', () => {
    const scene = createScene3DFromGltf(makeTriangleGltf());

    const children = getNodeChildren(scene.root);
    expect(children).toHaveLength(1);

    const meshNode = children[0] as Node3D;
    expect(isMesh(meshNode)).toBe(true);
    expect(getNodeLocalMatrix4(meshNode).m[12]).toBeCloseTo(5); // translation x

    const geometry = (meshNode as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    expect(getMeshGeometryIndexCount(geometry)).toBe(3);
  });

  it('drops the primitive when the POSITION accessor index is out of bounds', () => {
    const doc = makeTriangleGltf();
    // Point the POSITION attribute to accessor index 99, which does not exist in the array. POSITION is
    // mandatory, so an unreadable one leaves no usable geometry: the primitive drops with primitive-no-position
    // Drop (the honest classification), and the subsuming accessor fault is NOT emitted as a contradictory Recover.
    doc.meshes![0].primitives[0].attributes.POSITION = 99;
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.primitive-no-position');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstAccessor).toBe(99);
    expect(findGltfDiagnostic(diagnostics, 'gltf.accessor-not-found')).toBeUndefined();
    expect(isMesh(getNodeChildren(scene.root)[0] as Node3D)).toBe(false);
  });

  it('drops the primitive when the POSITION accessor bufferView is missing', () => {
    const doc = makeTriangleGltf();
    // Clear bufferViews so accessor.bufferView references a missing entry. POSITION faults first, so the
    // primitive drops (primitive-no-position Drop) before any other accessor is read.
    doc.bufferViews = [];
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.primitive-no-position');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(isMesh(getNodeChildren(scene.root)[0] as Node3D)).toBe(false);
  });

  it('returns a scene for a document with no nodes', () => {
    const scene = createScene3DFromGltf({ asset: { version: '2.0' } });
    expect(getNodeChildren(scene.root)).toHaveLength(0);
  });

  it('de-strides interleaved position and normal attributes via bufferView.byteStride', () => {
    // Two vertices interleaved as [px,py,pz, nx,ny,nz] — 6 floats (24-byte) records.
    const interleaved = new Float32Array([1, 2, 3, 0, 0, 1, 4, 5, 6, 0, 1, 0]);
    const uri = toDataUri(bytesOf(interleaved));
    const doc: GltfDocument = {
      accessors: [
        { bufferView: 0, byteOffset: 0, componentType: 5126, count: 2, type: 'VEC3' },
        { bufferView: 0, byteOffset: 12, componentType: 5126, count: 2, type: 'VEC3' },
      ],
      asset: { version: '2.0' },
      bufferViews: [{ buffer: 0, byteLength: interleaved.byteLength, byteOffset: 0, byteStride: 24 }],
      buffers: [{ byteLength: interleaved.byteLength, uri }],
      meshes: [{ primitives: [{ attributes: { NORMAL: 1, POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const geometry = (getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh).geometry;

    const p = { x: 0, y: 0, z: 0 };
    const n = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 0);
    getMeshGeometryVertexNormal(n, geometry, 0);
    expect([p.x, p.y, p.z]).toEqual([1, 2, 3]);
    expect([n.x, n.y, n.z]).toEqual([0, 0, 1]);
    getMeshGeometryVertexPosition(p, geometry, 1);
    getMeshGeometryVertexNormal(n, geometry, 1);
    expect([p.x, p.y, p.z]).toEqual([4, 5, 6]);
    expect([n.x, n.y, n.z]).toEqual([0, 1, 0]);
  });

  it('decodes normalized signed and unsigned integer attributes to their float ranges', () => {
    const positions = new Float32Array([1, 2, 3]); // 12 bytes
    const normals = new Int8Array([127, -128, 0]); // 3 bytes -> [1, -1, 0]
    const uvs = new Uint16Array([65535, 0]); // 4 bytes -> [1, 0]
    const uri = toDataUri(bytesOf(positions), bytesOf(normals), bytesOf(uvs));
    const doc: GltfDocument = {
      accessors: [
        { bufferView: 0, componentType: 5126, count: 1, type: 'VEC3' },
        { bufferView: 1, componentType: 5120, count: 1, normalized: true, type: 'VEC3' },
        { bufferView: 2, componentType: 5123, count: 1, normalized: true, type: 'VEC2' },
      ],
      asset: { version: '2.0' },
      bufferViews: [
        { buffer: 0, byteLength: 12, byteOffset: 0 },
        { buffer: 0, byteLength: 3, byteOffset: 12 },
        { buffer: 0, byteLength: 4, byteOffset: 15 },
      ],
      buffers: [{ byteLength: 19, uri }],
      meshes: [{ primitives: [{ attributes: { NORMAL: 1, POSITION: 0, TEXCOORD_0: 2 } }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const geometry = (getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh).geometry;

    const n = { x: 0, y: 0, z: 0 };
    const uv = { x: 0, y: 0 };
    getMeshGeometryVertexNormal(n, geometry, 0);
    getMeshGeometryVertexUv0(uv, geometry, 0);
    expect([n.x, n.y, n.z]).toEqual([1, -1, 0]);
    expect([uv.x, uv.y]).toEqual([1, 0]);
  });

  it('decodes a normalized SHORT (5122) attribute to the [-1, 1] float range', () => {
    // normalizeComponent divides int16 by 32767: 32767 → 1, -32767 → -1, 0 → 0.
    const positions = new Float32Array([1, 2, 3]);
    const normals = new Int16Array([32767, -32767, 0]);
    const uri = toDataUri(bytesOf(positions), bytesOf(normals));
    const doc: GltfDocument = {
      accessors: [
        { bufferView: 0, componentType: 5126, count: 1, type: 'VEC3' },
        { bufferView: 1, componentType: 5122, count: 1, normalized: true, type: 'VEC3' },
      ],
      asset: { version: '2.0' },
      bufferViews: [
        { buffer: 0, byteLength: 12, byteOffset: 0 },
        { buffer: 0, byteLength: 6, byteOffset: 12 },
      ],
      buffers: [{ byteLength: 18, uri }],
      meshes: [{ primitives: [{ attributes: { NORMAL: 1, POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const geometry = (getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh).geometry;
    const n = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexNormal(n, geometry, 0);
    expect(n.x).toBeCloseTo(1, 5);
    expect(n.y).toBeCloseTo(-1, 5);
    expect(n.z).toBeCloseTo(0, 5);
  });

  it('decodes a normalized UBYTE (5121) TEXCOORD_0 to the [0, 1] float range', () => {
    // normalizeComponent divides uint8 by 255: 255 → 1, 128 → ~0.502. TEXCOORD_0 is a schema-valid
    // semantic for a normalized UBYTE encoding (unlike NORMAL, which requires a signed type).
    const positions = new Float32Array([1, 2, 3]);
    const uvs = new Uint8Array([255, 128]); // VEC2
    const uri = toDataUri(bytesOf(positions), bytesOf(uvs));
    const doc: GltfDocument = {
      accessors: [
        { bufferView: 0, componentType: 5126, count: 1, type: 'VEC3' },
        { bufferView: 1, componentType: 5121, count: 1, normalized: true, type: 'VEC2' },
      ],
      asset: { version: '2.0' },
      bufferViews: [
        { buffer: 0, byteLength: 12, byteOffset: 0 },
        { buffer: 0, byteLength: 2, byteOffset: 12 },
      ],
      buffers: [{ byteLength: 14, uri }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 } }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const geometry = (getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh).geometry;
    const uv = { x: 0, y: 0 };
    getMeshGeometryVertexUv0(uv, geometry, 0);
    expect(uv.x).toBeCloseTo(1, 5);
    expect(uv.y).toBeCloseTo(128 / 255, 5);
  });

  it('drops the primitive when the POSITION accessor runs past its backing buffer', () => {
    // The accessor claims 10 vertices but the buffer holds only 3 — the bounds guard must reject it rather
    // than read out of range. Because it is the POSITION accessor, the primitive drops (primitive-no-position
    // Drop) instead of emitting a standalone accessor-past-buffer crumb.
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]); // 3 verts, 36 bytes
    const uri = toDataUri(bytesOf(positions));
    const doc: GltfDocument = {
      accessors: [{ bufferView: 0, componentType: 5126, count: 10, type: 'VEC3' }],
      asset: { version: '2.0' },
      bufferViews: [{ buffer: 0, byteLength: 120, byteOffset: 0 }],
      buffers: [{ byteLength: 120, uri }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.primitive-no-position');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(isMesh(getNodeChildren(scene.root)[0] as Node3D)).toBe(false);
  });

  it('keeps a drawable, finite mesh when an optional NORMAL accessor fails', () => {
    // POSITION survives, so the primitive is a usable survivor and the failed optional NORMAL is a Recover.
    // "Drawable" is the claim this test is named for, and a zero normal is not drawable: every lit material
    // normalizes it, and normalizing the zero vector is undefined. The recovery is the flat normal glTF
    // requires a client to calculate when NORMAL is absent, which is also what this test used to assert
    // against — it pinned the zeros as correct and so could never fail while the defect existed.
    const doc = makeTriangleGltf();
    doc.meshes![0].primitives[0].attributes.NORMAL = 99; // missing accessor
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.accessor-not-found');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    for (const value of geometry.vertices) expect(Number.isFinite(value)).toBe(true);

    const floatsPerVertex = geometry.layout.stride / 4;
    for (let v = 0; v < getMeshGeometryVertexCount(geometry); v++) {
      const base = v * floatsPerVertex + 3;
      expect(Math.hypot(geometry.vertices[base], geometry.vertices[base + 1], geometry.vertices[base + 2])).toBeCloseTo(
        1,
        5,
      );
    }
  });

  // glTF: "When normals are not specified, client implementations MUST calculate flat normals." The
  // importer emitted the zero-filled slot instead, so every lit material normalized a zero vector.
  // makeTriangleGltf is positions+indices only, which is why most parser tests ran straight through
  // the invalid path without noticing.
  it('calculates flat normals for a primitive with no NORMAL attribute', () => {
    const scene = createScene3DFromGltf(makeTriangleGltf());
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    const floatsPerVertex = geometry.layout.stride / 4;
    for (let v = 0; v < getMeshGeometryVertexCount(geometry); v++) {
      const base = v * floatsPerVertex + 3;
      // The triangle lies in the XY plane wound counter-clockwise, so its face normal is +Z.
      expect(geometry.vertices[base]).toBeCloseTo(0, 5);
      expect(geometry.vertices[base + 1]).toBeCloseTo(0, 5);
      expect(geometry.vertices[base + 2]).toBeCloseTo(1, 5);
    }
  });

  // Flat shading needs each face to own its corners. Without un-welding, a vertex shared by two faces
  // takes whichever normal was written last, which is neither face's answer.
  it('un-welds shared vertices so each face gets its own normal', () => {
    // Two triangles sharing an edge, folded 90 degrees apart: a shared vertex cannot carry both faces.
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const uri = toDataUri(bytesOf(positions), bytesOf(indices));
    const doc: GltfDocument = {
      accessors: [
        { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' },
      ],
      asset: { version: '2.0' },
      bufferViews: [
        { buffer: 0, byteLength: positions.byteLength, byteOffset: 0 },
        { buffer: 0, byteLength: indices.byteLength, byteOffset: positions.byteLength },
      ],
      buffers: [{ byteLength: positions.byteLength + indices.byteLength, uri }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };

    const scene = createScene3DFromGltf(doc);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    // Six corners after un-welding, not the four welded vertices.
    expect(getMeshGeometryVertexCount(geometry)).toBe(6);
    const floatsPerVertex = geometry.layout.stride / 4;
    const normalAt = (v: number) => {
      const base = v * floatsPerVertex + 3;
      return [geometry.vertices[base], geometry.vertices[base + 1], geometry.vertices[base + 2]];
    };
    // First face lies in the XY plane (+Z normal); the second lies in the YZ plane (+X normal). A
    // welded vertex 0 belongs to both and could only carry one of them.
    // All three components: one alone is satisfied by any wrong vector that happens to share it.
    expect(normalAt(0)).toEqual([expect.closeTo(0, 5), expect.closeTo(0, 5), expect.closeTo(1, 5)]);
    expect(normalAt(3)).toEqual([expect.closeTo(1, 5), expect.closeTo(0, 5), expect.closeTo(0, 5)]);
  });

  // Un-welding is what makes the normals exact, but shipping the result non-indexed would change how
  // every backend draws it. The geometry stays indexed.
  it('leaves the un-welded geometry indexed', () => {
    const scene = createScene3DFromGltf(makeTriangleGltf());
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    expect(geometry.indices).not.toBeNull();
    expect(getMeshGeometryIndexCount(geometry)).toBe(3);
  });

  // A point or line primitive has no facing. Fabricating one would be inventing data, and nothing
  // samples it — so the whole shading-completion pass has to leave it untouched, un-welding included.
  //
  // The index list repeats vertex 1 on purpose. Asserting only that the normals stay zero would pass
  // even with the topology guard removed, because the triangle walker yields no triangles for a point
  // list and so writes no normals anyway — a real assertion that cannot fail for the reason the test is
  // named after. The duplicate is what makes un-welding observable: it would expand four elements into
  // four distinct vertices where the source has three.
  it('leaves a non-triangle primitive entirely untouched', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint16Array([0, 1, 2, 1]);
    const uri = toDataUri(bytesOf(positions), bytesOf(indices));
    const doc: GltfDocument = {
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 4, type: 'SCALAR' },
      ],
      asset: { version: '2.0' },
      bufferViews: [
        { buffer: 0, byteLength: positions.byteLength, byteOffset: 0 },
        { buffer: 0, byteLength: indices.byteLength, byteOffset: positions.byteLength },
      ],
      buffers: [{ byteLength: positions.byteLength + indices.byteLength, uri }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 0 }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };

    const scene = createScene3DFromGltf(doc);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    expect(geometry.vertices[3]).toBe(0);
    expect(geometry.vertices[4]).toBe(0);
    expect(geometry.vertices[5]).toBe(0);
  });

  // glTF: a client SHOULD calculate tangents when a normal texture is bound and TANGENT is absent.
  // Shaders reconstruct the bitangent as B = w·cross(N, T), so a zero T with w = 0 collapses the whole
  // TBN basis and the sampled normal has no frame to transform through. The escape here was a seam:
  // parser tests pinned the zero tangent, material tests separately pinned normal-map binding, and no
  // test composed the two — each half looked correct alone.
  it('calculates a tangent basis when a normal map is bound without TANGENT', () => {
    const doc = makeUvTriangleGltf();
    doc.materials = [{ normalTexture: { index: 0 } }];
    doc.meshes![0].primitives[0].material = 0;

    const scene = createScene3DFromGltf(doc);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    const floatsPerVertex = geometry.layout.stride / 4;
    for (let v = 0; v < getMeshGeometryVertexCount(geometry); v++) {
      const base = v * floatsPerVertex + 6;
      // U runs along +X across this triangle, so the tangent must be +X. Asserting only that |T| = 1
      // would be satisfied by a unit tangent pointing anywhere at all.
      expect(geometry.vertices[base]).toBeCloseTo(1, 5);
      expect(geometry.vertices[base + 1]).toBeCloseTo(0, 5);
      expect(geometry.vertices[base + 2]).toBeCloseTo(0, 5);
      // The handedness w must be a real sign; zero is the collapsed basis this repairs.
      expect(Math.abs(geometry.vertices[base + 3])).toBeCloseTo(1, 5);
    }
  });

  // No normal map means nothing samples tangent space, so a tangent would be derived data nobody reads.
  it('leaves the tangent slot alone when no normal map is bound', () => {
    const scene = createScene3DFromGltf(makeUvTriangleGltf());
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    expect(geometry.vertices[6]).toBe(0);
    expect(geometry.vertices[7]).toBe(0);
    expect(geometry.vertices[8]).toBe(0);
    expect(geometry.vertices[9]).toBe(0);
  });

  // A morph target's deltas are addressed by the ORIGINAL vertex indices, so un-welding a morphed
  // primitive would silently misalign every blend shape — the deltas would land on the wrong corners
  // with nothing reporting it. Those keep their vertex identity and take the in-place normals instead.
  //
  // The fixture must be INDEXED and share a vertex, or un-welding is a no-op and the test cannot tell
  // the guard from its absence. Two triangles over four vertices expand to six; staying at four is the
  // assertion.
  it('does not un-weld a morphed primitive, so its blend-shape deltas stay aligned', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]);
    const posDeltas = new Float32Array([0, 10, 0, 0, 10, 0, 0, 10, 0, 0, 10, 0]);
    const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
    const uri = toDataUri(bytesOf(positions), bytesOf(posDeltas), bytesOf(indices));
    const doc: GltfDocument = {
      accessors: [
        { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' },
        { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' },
        { bufferView: 2, componentType: 5123, count: 6, type: 'SCALAR' },
      ],
      asset: { version: '2.0' },
      bufferViews: [
        { buffer: 0, byteLength: positions.byteLength, byteOffset: 0 },
        { buffer: 0, byteLength: posDeltas.byteLength, byteOffset: positions.byteLength },
        { buffer: 0, byteLength: indices.byteLength, byteOffset: positions.byteLength + posDeltas.byteLength },
      ],
      buffers: [{ byteLength: positions.byteLength + posDeltas.byteLength + indices.byteLength, uri }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 2, targets: [{ POSITION: 1 }] }], weights: [0] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };

    const scene = createScene3DFromGltf(doc);
    const mesh = getNodeChildren(scene.root)[0] as Mesh;
    const geometry = mesh.geometry;

    // Four vertices, not the six an un-weld would produce — so the deltas still address their vertices.
    expect(getMeshGeometryVertexCount(geometry)).toBe(4);
    expect(mesh.morph!.targets[0].positionDeltas).toHaveLength(4 * 3);
    // Still repaired: a real facing rather than the zero vector, even without the un-weld.
    expect(Math.hypot(geometry.vertices[3], geometry.vertices[4], geometry.vertices[5])).toBeCloseTo(1, 5);
  });

  it('drops the primitive when the indices accessor is unreadable', () => {
    // The index buffer defines topology; without it the vertex storage order is not a sane triangle list, so
    // no usable primitive survives — the primitive drops (Drop, mandatory role) rather than keep it undrawable.
    const doc = makeTriangleGltf();
    doc.meshes![0].primitives[0].indices = 99; // missing accessor
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.accessor-not-found');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.detail?.firstAccessor).toBe(99);
    expect(isMesh(getNodeChildren(scene.root)[0] as Node3D)).toBe(false);
  });

  it('drops the mesh entirely for a primitive with no POSITION attribute', () => {
    // Position is mandatory, so an empty-geometry primitive is unusable and DROPPED (not emitted): the mesh's
    // only primitive drops, so its node becomes a bare node with no mesh. Drop matches md5mesh.mesh-empty.
    const doc = makeTriangleGltf();
    doc.meshes![0].primitives[0].attributes = {}; // drop POSITION
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.primitive-no-position');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    // The node survives but carries no mesh (the empty primitive was dropped, not emitted as an empty mesh).
    const node = getNodeChildren(scene.root)[0] as Node3D;
    expect(isMesh(node)).toBe(false);
  });

  it('imports every primitive of a multi-primitive mesh as its own sub-mesh', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const uri = toDataUri(bytesOf(positions));
    const doc: GltfDocument = {
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      asset: { version: '2.0' },
      bufferViews: [{ buffer: 0, byteLength: positions.byteLength, byteOffset: 0 }],
      buffers: [{ byteLength: positions.byteLength, uri }],
      meshes: [
        {
          primitives: [
            { attributes: { POSITION: 0 }, material: 0 },
            { attributes: { POSITION: 0 }, material: 1 },
          ],
        },
      ],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const groupNode = getNodeChildren(createScene3DFromGltf(doc).root)[0] as Node3D;

    // A multi-primitive mesh node is a transform-only group with one Mesh child per primitive.
    expect(isMesh(groupNode)).toBe(false);
    const subMeshes = getNodeChildren(groupNode);
    expect(subMeshes).toHaveLength(2);
    expect(isMesh(subMeshes[0] as Node3D)).toBe(true);
    expect(getMeshGeometryVertexCount((subMeshes[1] as Mesh).geometry)).toBe(3);
  });

  it('imports the TANGENT attribute into the canonical tangent slot when present', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const tangents = new Float32Array([1, 0, 0, 1, 0, 1, 0, -1, 0, 0, 1, 1]); // VEC4 per vertex
    const uri = toDataUri(bytesOf(positions), bytesOf(tangents));
    const doc: GltfDocument = {
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5126, count: 3, type: 'VEC4' },
      ],
      asset: { version: '2.0' },
      bufferViews: [
        { buffer: 0, byteLength: positions.byteLength, byteOffset: 0 },
        { buffer: 0, byteLength: tangents.byteLength, byteOffset: positions.byteLength },
      ],
      buffers: [{ byteLength: positions.byteLength + tangents.byteLength, uri }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, TANGENT: 1 } }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const geometry = (getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh).geometry;

    const t = { w: 0, x: 0, y: 0, z: 0 };
    getMeshGeometryVertexTangent(t, geometry, 1);
    expect([t.x, t.y, t.z, t.w]).toEqual([0, 1, 0, -1]);
  });

  it('zero-fills the tangent slot when a primitive has no TANGENT attribute', () => {
    const geometry = (getNodeChildren(createScene3DFromGltf(makeTriangleGltf()).root)[0] as Mesh).geometry;
    const t = { w: 0, x: 0, y: 0, z: 0 };
    getMeshGeometryVertexTangent(t, geometry, 0);
    expect([t.x, t.y, t.z, t.w]).toEqual([0, 0, 0, 0]);
  });

  it('returns an empty scene and warns on malformed JSON instead of throwing', () => {
    const diagnostics: ImportDiagnostic[] = [];
    let scene;
    expect(() => {
      scene = createScene3DFromGltf('{ this is not valid json', diagnostics);
    }).not.toThrow();
    expect(getNodeChildren(scene!.root)).toHaveLength(0);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('warns when asset.version has an unsupported major version', () => {
    const doc = makeTriangleGltf();
    doc.asset = { version: '3.0' };
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.unsupported-version');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.version).toBe('3.0');
  });

  it.each([
    [0, 'point-list'],
    [1, 'line-list'],
    [3, 'line-strip'],
    [4, 'triangle-list'],
    [5, 'triangle-strip'],
  ] as const)('maps glTF primitive mode %s to %s', (mode, topology) => {
    const doc = makeTriangleGltf();
    doc.meshes![0].primitives[0].mode = mode;
    const geometry = (getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh).geometry;
    expect(geometry.topology).toBe(topology);
  });

  it('converts glTF line loops into closed line-list indices', () => {
    const doc = makeTriangleGltf();
    doc.meshes![0].primitives[0].mode = 2;
    const geometry = (getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh).geometry;
    expect(geometry.topology).toBe('line-list');
    expect(Array.from(geometry.indices ?? [])).toEqual([0, 1, 1, 2, 2, 0]);
  });

  it('converts glTF triangle fans into triangle-list indices', () => {
    const doc = makeTriangleGltf();
    doc.meshes![0].primitives[0].mode = 6;
    const geometry = (getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh).geometry;
    expect(geometry.topology).toBe('triangle-list');
    expect(Array.from(geometry.indices ?? [])).toEqual([0, 1, 2]);
  });

  it('drops the primitive for an unknown mode instead of keeping undrawable geometry', () => {
    // Mode 7 has no valid topology; reinterpreting it would draw wrong geometry and keeping zero elements
    // is undrawable, so neither is a usable survivor — the primitive drops (Drop) and no mesh is emitted.
    const doc = makeTriangleGltf();
    doc.meshes![0].primitives[0].mode = 7;
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.primitive-unsupported-mode');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstMode).toBe(7);
    expect(isMesh(getNodeChildren(scene.root)[0] as Node3D)).toBe(false);
  });

  it('applies a matrix transform when node.matrix is a 16-element column-major array', () => {
    // A translation matrix (column-major) placing the node at (10, 20, 30).
    const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1];
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const uri = toDataUri(bytesOf(positions));
    const doc: GltfDocument = {
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      asset: { version: '2.0' },
      bufferViews: [{ buffer: 0, byteLength: positions.byteLength, byteOffset: 0 }],
      buffers: [{ byteLength: positions.byteLength, uri }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ matrix, mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const meshNode = getNodeChildren(createScene3DFromGltf(doc).root)[0] as Node3D;
    const m = getNodeLocalMatrix4(meshNode).m;
    expect(m[12]).toBeCloseTo(10);
    expect(m[13]).toBeCloseTo(20);
    expect(m[14]).toBeCloseTo(30);
    expect(m[0]).toBeCloseTo(1);
    expect(m[5]).toBeCloseTo(1);
    expect(m[10]).toBeCloseTo(1);
    expect(m[15]).toBeCloseTo(1);
  });

  it('applies a quaternion rotation from node.rotation', () => {
    // 90-degree rotation around the Z axis: quaternion [0, 0, sin(45deg), cos(45deg)].
    const s = Math.sin(Math.PI / 4);
    const c = Math.cos(Math.PI / 4);
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const uri = toDataUri(bytesOf(positions));
    const doc: GltfDocument = {
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      asset: { version: '2.0' },
      bufferViews: [{ buffer: 0, byteLength: positions.byteLength, byteOffset: 0 }],
      buffers: [{ byteLength: positions.byteLength, uri }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0, rotation: [0, 0, s, c] }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const meshNode = getNodeChildren(createScene3DFromGltf(doc).root)[0] as Node3D;
    const m = getNodeLocalMatrix4(meshNode).m;
    // After 90-degree Z rotation: col0 ≈ [0, 1, 0], col1 ≈ [-1, 0, 0].
    expect(m[0]).toBeCloseTo(0);
    expect(m[1]).toBeCloseTo(1);
    expect(m[4]).toBeCloseTo(-1);
    expect(m[5]).toBeCloseTo(0);
    expect(m[10]).toBeCloseTo(1);
  });

  it('applies scale transforms from node.scale', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const uri = toDataUri(bytesOf(positions));
    const doc: GltfDocument = {
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      asset: { version: '2.0' },
      bufferViews: [{ buffer: 0, byteLength: positions.byteLength, byteOffset: 0 }],
      buffers: [{ byteLength: positions.byteLength, uri }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0, scale: [2, 3, 4] }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const meshNode = getNodeChildren(createScene3DFromGltf(doc).root)[0] as Node3D;
    const m = getNodeLocalMatrix4(meshNode).m;
    expect(m[0]).toBeCloseTo(2);
    expect(m[5]).toBeCloseTo(3);
    expect(m[10]).toBeCloseTo(4);
    // Off-diagonal rotation elements should be zero (identity rotation with scale).
    expect(m[1]).toBeCloseTo(0);
    expect(m[2]).toBeCloseTo(0);
    expect(m[4]).toBeCloseTo(0);
  });

  it('reads uint32 index buffers (componentType 5125) correctly', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    // Uint32 indices — values within uint16 range to keep the triangle valid, but the accessor
    // declares componentType 5125 (UNSIGNED_INT) to exercise the uint32 read path.
    const indices = new Uint32Array([0, 1, 2]);
    const uri = toDataUri(bytesOf(positions), bytesOf(indices));
    const doc: GltfDocument = {
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5125, count: 3, type: 'SCALAR' },
      ],
      asset: { version: '2.0' },
      bufferViews: [
        { buffer: 0, byteLength: positions.byteLength, byteOffset: 0 },
        { buffer: 0, byteLength: indices.byteLength, byteOffset: positions.byteLength },
      ],
      buffers: [{ byteLength: positions.byteLength + indices.byteLength, uri }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const geometry = (getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    expect(getMeshGeometryIndexCount(geometry)).toBe(3);
    const p = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 0);
    expect([p.x, p.y, p.z]).toEqual([0, 0, 0]);
    getMeshGeometryVertexPosition(p, geometry, 1);
    expect([p.x, p.y, p.z]).toEqual([1, 0, 0]);
  });

  it('selects the correct scene when the document.scene index is not 0', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const uri = toDataUri(bytesOf(positions));
    const doc: GltfDocument = {
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      asset: { version: '2.0' },
      bufferViews: [{ buffer: 0, byteLength: positions.byteLength, byteOffset: 0 }],
      buffers: [{ byteLength: positions.byteLength, uri }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      // Node 0 goes to scene 0; node 1 (the mesh) goes to scene 1.
      nodes: [{ translation: [99, 0, 0] }, { mesh: 0 }],
      scene: 1,
      scenes: [{ nodes: [0] }, { nodes: [1] }],
    };
    const scene = createScene3DFromGltf(doc);
    const roots = getNodeChildren(scene.root);
    // Scene3D 1 has only node 1 (the mesh node), not node 0.
    expect(roots).toHaveLength(1);
    expect(isMesh(roots[0] as Node3D)).toBe(true);
  });

  it('warns when extensionsRequired names an unsupported extension', () => {
    const doc = makeTriangleGltf();
    doc.extensionsRequired = ['KHR_draco_mesh_compression'];
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.unsupported-required-extension');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstExtension).toBe('KHR_draco_mesh_compression');
  });

  it('does not label the consumed KHR_texture_transform extension unsupported', () => {
    const doc = makeTriangleGltf();
    doc.extensionsRequired = ['KHR_texture_transform'];
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    expect(diagnostics).toEqual([]);
  });

  it('imports a skin binding the mesh to a skeleton over its joint nodes', () => {
    const scene = createScene3DFromGltf(makeSkinnedGltf());
    const roots = getNodeChildren(scene.root);
    const meshNode = roots[0] as unknown as Mesh;
    const jointNode = roots[1] as Node3D;

    expect(isMesh(roots[0] as Node3D)).toBe(true);
    expect(meshNode.skin).toBeTruthy();
    expect(meshNode.skin?.skeleton.joints).toHaveLength(1);
    // The skin's joint resolves to the built Node3D, and its name carries through.
    expect(meshNode.skin?.skeleton.joints[0]).toBe(jointNode);
    expect(meshNode.skin?.skeleton.names).toEqual(['joint']);
  });

  it('emits the skinned layout with renormalized weights for a skinned primitive', () => {
    const scene = createScene3DFromGltf(makeSkinnedGltf());
    const geometry = (getNodeChildren(scene.root)[0] as unknown as Mesh).geometry;

    expect(geometry.layout.stride).toBe(80);
    // joints0 at float 12, weights0 at float 16; vertex 0 is fully weighted to joint 0.
    expect(geometry.vertices[12]).toBe(0);
    expect(geometry.vertices[16]).toBeCloseTo(1);
  });

  it('defaults inverse-bind matrices to identity when the skin omits them', () => {
    const scene = createScene3DFromGltf(makeSkinnedGltf(false));
    const meshNode = getNodeChildren(scene.root)[0] as unknown as Mesh;
    const inverseBind = meshNode.skin?.skeleton.inverseBindMatrices;

    expect(inverseBind?.length).toBe(16);
    // Identity: diagonal ones, off-diagonal zeros.
    expect(inverseBind?.[0]).toBe(1);
    expect(inverseBind?.[5]).toBe(1);
    expect(inverseBind?.[10]).toBe(1);
    expect(inverseBind?.[15]).toBe(1);
    expect(inverseBind?.[1]).toBe(0);
  });

  it('recovers to identity inverse-bind matrices when the accessor has too few for the joints', () => {
    // A present IBM accessor with count 0 covers none of the skin's one joint. Filling the missing joint
    // with a zero matrix would collapse the mesh to the origin, so recover to identity (bind pose) for the
    // joint and Recover-crumb the mismatch rather than emit a corrupt palette.
    const doc = makeSkinnedGltf(true);
    doc.accessors![3].count = 0; // inverse-bind-matrices accessor: zero matrices for one joint
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.skin-ibm-count-mismatch');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstExpected).toBe(1);
    expect(crumb!.detail?.firstActual).toBe(0);
    const inverseBind = (getNodeChildren(scene.root)[0] as unknown as Mesh).skin?.skeleton.inverseBindMatrices;
    expect(inverseBind?.[0]).toBe(1);
    expect(inverseBind?.[5]).toBe(1);
    expect(inverseBind?.[10]).toBe(1);
    expect(inverseBind?.[15]).toBe(1);
    expect(inverseBind?.[1]).toBe(0);
  });

  it('leaves an unskinned primitive on the canonical layout with no skin', () => {
    const scene = createScene3DFromGltf(makeTriangleGltf());
    const meshNode = getNodeChildren(scene.root)[0] as unknown as Mesh;

    expect(meshNode.skin ?? null).toBeNull();
    expect(meshNode.geometry.layout.stride).toBe(48);
  });
});

// A document with two nodes (each instancing a positions-only mesh) split across two scenes, plus one
// animation rotating node 1. Exercises multi-scene assembly and animation binding together.
function makeAnimatedMultiScene3DGltf(): GltfDocument {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const times = new Float32Array([0, 1]);
  // Two keyframe quaternions: identity, then 90° about Y.
  const rotations = new Float32Array([0, 0, 0, 1, 0, 0.7071, 0, 0.7071]);
  const posLen = positions.byteLength;
  const timesLen = times.byteLength;
  const uri = toDataUri(bytesOf(positions), bytesOf(times), bytesOf(rotations));

  return {
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }, // positions
      { bufferView: 1, componentType: 5126, count: 2, type: 'SCALAR' }, // times
      { bufferView: 2, componentType: 5126, count: 2, type: 'VEC4' }, // rotation quats
    ],
    animations: [
      {
        channels: [{ sampler: 0, target: { node: 1, path: 'rotation' } }],
        name: 'spin',
        samplers: [{ input: 1, interpolation: 'LINEAR', output: 2 }],
      },
    ],
    asset: { version: '2.0' },
    bufferViews: [
      { buffer: 0, byteLength: posLen, byteOffset: 0 },
      { buffer: 0, byteLength: timesLen, byteOffset: posLen },
      { buffer: 0, byteLength: rotations.byteLength, byteOffset: posLen + timesLen },
    ],
    buffers: [{ byteLength: posLen + timesLen + rotations.byteLength, uri }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }, { mesh: 0 }],
    scene: 0,
    scenes: [{ nodes: [0] }, { nodes: [1] }],
  };
}

describe('createScene3DFromGltf animations', () => {
  it('drops a weights channel targeting a node with no morphable mesh, with a warning', () => {
    const doc = makeAnimatedMultiScene3DGltf();
    // Node 1's mesh has no morph targets, so the weights channel cannot bind and is dropped. Weights output is
    // SCALAR, so add a SCALAR-output sampler (reusing the SCALAR times accessor) rather than the VEC4 rotation
    // sampler — the point under test is the no-morphable-mesh drop, not a type mismatch.
    doc.animations![0].samplers.push({ input: 1, interpolation: 'LINEAR', output: 1 });
    doc.animations![0].channels.push({ sampler: 1, target: { node: 1, path: 'weights' } });
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    expect(Object.values(scene.animations)[0].channels).toHaveLength(1); // only the rotation channel survives
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.weights-no-morphable-mesh');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
  });

  it('imports a translation channel as a 3-component non-quaternion track', () => {
    // A schema-valid VEC3 translation output (rotation would be VEC4); the track is a 3-component non-quaternion.
    const doc = makeChannelGltf({
      interpolation: 'LINEAR',
      output: new Float32Array([0, 0, 0, 1, 2, 3]),
      outputCount: 2,
      outputType: 'VEC3',
      path: 'translation',
      times: new Float32Array([0, 1]),
    });
    const clip = Object.values(createScene3DFromGltf(doc).animations)[0];
    expect((clip.channels[0].targetRef as Scene3DAnimationTarget).path).toBe('Translation');
    expect(clip.channels[0].track.quaternion).toBe(false);
    expect(clip.channels[0].track.components).toBe(3);
  });

  it('imports a scale channel as a 3-component Scale track that samples its VEC3 values', () => {
    // A schema-valid VEC3 scale output (1,1,1) → (2,2,2); sampling the midpoint proves the track holds the
    // scale payload (not a mislabeled quaternion), interpolating to (1.5, 1.5, 1.5).
    const doc = makeChannelGltf({
      interpolation: 'LINEAR',
      output: new Float32Array([1, 1, 1, 2, 2, 2]),
      outputCount: 2,
      outputType: 'VEC3',
      path: 'scale',
      times: new Float32Array([0, 1]),
    });
    const clip = Object.values(createScene3DFromGltf(doc).animations)[0];
    expect((clip.channels[0].targetRef as Scene3DAnimationTarget).path).toBe('Scale');
    expect(clip.channels[0].track.components).toBe(3);
    const out = [0, 0, 0];
    sampleAnimationTrack(out, clip.channels[0].track, 0.5);
    expect(out[0]).toBeCloseTo(1.5, 5);
    expect(out[1]).toBeCloseTo(1.5, 5);
    expect(out[2]).toBeCloseTo(1.5, 5);
  });

  it('maps the STEP sampler interpolation to a Step track that holds the previous keyframe', () => {
    // STEP holds key 0 across the whole [0,1] segment, so sampling at t=0.5 returns the first quaternion.
    const doc = makeChannelGltf({
      interpolation: 'STEP',
      output: new Float32Array([0, 0, 0, 1, 0, 0.7071, 0, 0.7071]),
      outputCount: 2,
      outputType: 'VEC4',
      path: 'rotation',
      times: new Float32Array([0, 1]),
    });
    const track = Object.values(createScene3DFromGltf(doc).animations)[0].channels[0].track;
    expect(track.interpolation).toBe('Step');
    const out = [0, 0, 0, 0];
    sampleAnimationTrack(out, track, 0.5);
    expect(out).toEqual([0, 0, 0, 1]); // frozen at keyframe 0, not interpolated toward keyframe 1
  });

  it('maps the CUBICSPLINE sampler interpolation to a Cubic Hermite track that samples correctly', () => {
    // glTF CUBICSPLINE stores 3 elements per keyframe (in-tangent, value, out-tangent). Two keys of a VEC3
    // translation → 6 VEC3 elements. With zero tangents and values (0,0,0)→(10,0,0), the Hermite midpoint
    // (t=0.5) is (3t²-2t³)·10 = 5 — a value only reachable if the parser laid the cubic payload out right.
    const output = new Float32Array([
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0, // key 0: in-tangent, value, out-tangent
      0,
      0,
      0,
      10,
      0,
      0,
      0,
      0,
      0, // key 1: in-tangent, value (10,0,0), out-tangent
    ]);
    const doc = makeChannelGltf({
      interpolation: 'CUBICSPLINE',
      output,
      outputCount: 6,
      outputType: 'VEC3',
      path: 'translation',
      times: new Float32Array([0, 1]),
    });
    const track = Object.values(createScene3DFromGltf(doc).animations)[0].channels[0].track;
    expect(track.interpolation).toBe('Cubic');
    const out = [0, 0, 0];
    sampleAnimationTrack(out, track, 0.5);
    expect(out[0]).toBeCloseTo(5, 5);
    expect(out[1]).toBeCloseTo(0, 5);
    expect(out[2]).toBeCloseTo(0, 5);
  });

  it('returns an empty scene for invalid input', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf('{ not json', diagnostics);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    expect(Object.keys(scene.animations)).toHaveLength(0);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.invalid-json');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Reject);
    expect(crumb!.origin).toBe('parseGltfSource');
  });

  it('reads primitives[].targets into the mesh morph set with seeded weights', () => {
    const scene = createScene3DFromGltf(makeMorphGltf());
    const mesh = getNodeChildren(scene.root)[0] as Mesh;
    expect(mesh.morph).not.toBeNull();
    expect(mesh.morph!.targets).toHaveLength(1);
    expect(Array.from(mesh.morph!.targets[0].positionDeltas)).toEqual([0, 10, 0, 0, 10, 0, 0, 10, 0]);
    expect(Array.from(mesh.morph!.targets[0].normalDeltas!)).toEqual([0, 1, 0, 0, 1, 0, 0, 1, 0]);
    expect(mesh.morph!.targets[0].tangentDeltas).toBeNull();
    // mesh.weights: [0] seeds the initial weight.
    expect(Array.from(mesh.morph!.weights)).toEqual([0]);
  });

  it('reads a morph target TANGENT accessor into non-null tangentDeltas', () => {
    // The sibling test above asserts tangentDeltas is null when no TANGENT target is present; this covers the
    // populated branch — a VEC3 TANGENT delta accessor is read into the target's tangentDeltas.
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const posDeltas = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]);
    const tanDeltas = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const uri = toDataUri(bytesOf(positions), bytesOf(posDeltas), bytesOf(tanDeltas));
    let o = 0;
    const view = (len: number) => {
      const bv = { buffer: 0, byteLength: len, byteOffset: o };
      o += len;
      return bv;
    };
    const doc: GltfDocument = {
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 2, componentType: 5126, count: 3, type: 'VEC3' },
      ],
      asset: { version: '2.0' },
      bufferViews: [view(positions.byteLength), view(posDeltas.byteLength), view(tanDeltas.byteLength)],
      buffers: [{ byteLength: o, uri }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, targets: [{ POSITION: 1, TANGENT: 2 }] }], weights: [0] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const mesh = getNodeChildren(createScene3DFromGltf(doc).root)[0] as Mesh;
    expect(mesh.morph!.targets[0].tangentDeltas).not.toBeNull();
    expect(Array.from(mesh.morph!.targets[0].tangentDeltas!)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('imports a weights channel bound to the mesh morph, its width the target count', () => {
    const scene = createScene3DFromGltf(makeMorphGltf());
    expect(Object.keys(scene.animations)).toHaveLength(1);
    const clip = Object.values(scene.animations)[0];
    expect(clip.channels).toHaveLength(1);
    const channel = clip.channels[0];
    const target = channel.targetRef as Scene3DAnimationTarget;
    expect(target.path).toBe('Weights');
    expect(target.node).toBe(getNodeChildren(scene.root)[0]);
    expect(channel.track.components).toBe(1); // one morph target → one weight component
    expect(Array.from(channel.track.times)).toEqual([0, 1]);
  });
});

describe('createScene3DFromGltf uv set declarations', () => {
  // Geometry import carries TEXCOORD_0 only. A material asking for another set therefore samples set 0
  // — the right texels read through the wrong coordinates, which renders as a plausible but wrong
  // image rather than a visible failure. Importing the higher sets is a separate cross-package step;
  // what this pins is that the file's request is not swallowed on the way past.
  function makeTexturedGltf(textureInfo: Record<string, unknown>): GltfDocument {
    const doc = makeTriangleGltf() as GltfDocument & { [k: string]: unknown };
    doc.images = [{ mimeType: 'image/png', uri: 'data:image/png;base64,iVBORw0KGgo=' }];
    doc.textures = [{ source: 0 }];
    doc.materials = [{ pbrMetallicRoughness: { baseColorTexture: textureInfo } }] as never;
    doc.meshes![0].primitives[0].material = 0;
    return doc;
  }

  it('reports a texCoord set the parser cannot supply', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(makeTexturedGltf({ index: 0, texCoord: 1 }), diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.texcoord-set-unsupported');
    expect(crumb).not.toBeUndefined();
    expect(crumb?.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb?.detail?.firstUvSet).toBe(1);
  });

  it('lets KHR_texture_transform override the set it reports', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(
      makeTexturedGltf({ index: 0, texCoord: 0, extensions: { KHR_texture_transform: { texCoord: 2 } } }),
      diagnostics,
    );
    expect(findGltfDiagnostic(diagnostics, 'gltf.texcoord-set-unsupported')?.detail?.firstUvSet).toBe(2);
  });

  it('stays silent for the set it does supply, whether declared or omitted', () => {
    for (const info of [{ index: 0 }, { index: 0, texCoord: 0 }]) {
      const diagnostics: ImportDiagnostic[] = [];
      createScene3DFromGltf(makeTexturedGltf(info), diagnostics);
      expect(findGltfDiagnostic(diagnostics, 'gltf.texcoord-set-unsupported')).toBeUndefined();
    }
  });

  it('still builds the material and its texture — this is a Recover, not a drop', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(makeTexturedGltf({ index: 0, texCoord: 1 }), diagnostics);
    expect(scene).not.toBeNull();
  });
});

describe('createScene3DsFromGlb', () => {
  it('imports every scene from a GLB container, with animations on the default scene', () => {
    const glb = buildGlb(makeAnimatedMultiScene3DGltf(), new Uint8Array(0));
    const scenes = createScene3DsFromGlb(glb);
    expect(scenes).toHaveLength(2);
    expect(Object.keys(scenes[0].animations)).toHaveLength(1);
  });

  it('returns an empty array for a malformed container', () => {
    expect(createScene3DsFromGlb(new Uint8Array([1, 2, 3]))).toHaveLength(0);
  });
});

describe('createScene3DsFromGltf', () => {
  it('returns every scene the document declares, each carrying its geometry', () => {
    const scenes = createScene3DsFromGltf(makeAnimatedMultiScene3DGltf());
    expect(scenes).toHaveLength(2);
    expect(getNodeChildren(scenes[0].root)).toHaveLength(1);
    expect(getNodeChildren(scenes[1].root)).toHaveLength(1);
  });

  it('attaches the file animation clips to the default scene, bound to the driven node', () => {
    const scenes = createScene3DsFromGltf(makeAnimatedMultiScene3DGltf());
    expect(Object.keys(scenes[0].animations)).toHaveLength(1);
    const clip = Object.values(scenes[0].animations)[0];
    expect(clip.channels).toHaveLength(1);
    expect(clip.duration).toBe(1); // max keyframe time

    const channel = clip.channels[0];
    const target = channel.targetRef as Scene3DAnimationTarget;
    expect(target.path).toBe('Rotation');
    // The channel binds the SAME node instance that lives in scene 1 (node 1), not a fresh copy.
    expect(target.node).toBe(getNodeChildren(scenes[1].root)[0]);
    // Rotation tracks are quaternion tracks (4 components, slerped).
    expect(channel.track.quaternion).toBe(true);
    expect(channel.track.components).toBe(4);
    expect(channel.track.interpolation).toBe('Linear');
    expect(Array.from(channel.track.times)).toEqual([0, 1]);
  });

  it('returns an empty array for invalid input', () => {
    const diagnostics: ImportDiagnostic[] = [];
    expect(createScene3DsFromGltf('{ not json', diagnostics)).toHaveLength(0);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.invalid-json');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Reject);
    expect(crumb!.origin).toBe('parseGltfSource');
  });
});

describe('gltf diagnostics coverage', () => {
  it('rejects and reports gltf.not-an-object for a JSON scalar', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf('42', diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.not-an-object');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Reject);
    expect(crumb!.origin).toBe('parseGltfSource');
  });

  it('rejects and reports glb.header-too-small for a sub-12-byte container', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGlb(new Uint8Array(4), diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'glb.header-too-small');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Reject);
    expect(crumb!.origin).toBe('readGlbContainer');
  });

  it('rejects and reports glb.no-json-chunk for a header-only container', () => {
    const bytes = new Uint8Array(12);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x46546c67, true); // magic 'glTF'
    view.setUint32(4, 2, true); // version
    view.setUint32(8, 12, true); // total length = header only
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGlb(bytes, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'glb.no-json-chunk');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Reject);
    expect(crumb!.origin).toBe('readGlbContainer');
  });

  it('recovers and reports glb.chunk-past-end when the oversized chunk is the JSON chunk (no usable document)', () => {
    const glb = buildGlb(makeTriangleGltf(), new Uint8Array(0));
    // Overwrite the first (JSON) chunk's length (uint32 at offset 12) with a value past the container end, so
    // the walk breaks before any JSON is read. chunk-past-end is Recover; the whole-input refusal is the
    // separate glb.no-json-chunk Reject that then fires, so the scene is empty.
    new DataView(glb.buffer).setUint32(12, glb.byteLength + 1000, true);
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGlb(glb, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'glb.chunk-past-end');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('readGlbContainer');
    expect(findGltfDiagnostic(diagnostics, 'glb.no-json-chunk')).toBeDefined();
    expect(getNodeChildren(scene.root)).toHaveLength(0);
  });

  it('recovers via glb.chunk-past-end and still returns the document when a valid JSON chunk precedes the bad chunk', () => {
    const glb = buildGlb(makeTriangleGltf(), new Uint8Array(0));
    const view = new DataView(glb.buffer);
    // Walk to the SECOND chunk (past the valid JSON chunk) and oversize its length. The JSON parses first, so
    // the container recovers: chunk-past-end is a Recover and the mesh document is still returned.
    const secondChunkOffset = 12 + 8 + view.getUint32(12, true);
    view.setUint32(secondChunkOffset, glb.byteLength + 1000, true);
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGlb(glb, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'glb.chunk-past-end');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('readGlbContainer');
    // Recover means continued import: the mesh from the valid JSON chunk survives.
    expect(getNodeChildren(scene.root)).toHaveLength(1);
    expect(findGltfDiagnostic(diagnostics, 'glb.no-json-chunk')).toBeUndefined();
  });

  it('drops and reports gltf.camera-missing for a node referencing a missing camera', () => {
    const doc = { asset: { version: '2.0' }, nodes: [{ camera: 5 }], scenes: [{ nodes: [0] }] } as GltfDocument;
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.camera-missing');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.firstCamera).toBe(5);
    expect(crumb!.detail?.firstNode).toBe(0);
  });

  it('drops and reports gltf.camera-invalid-perspective for a bad view volume', () => {
    const doc = {
      asset: { version: '2.0' },
      cameras: [{ perspective: { yfov: 0, znear: 0.1 }, type: 'perspective' }],
      nodes: [{ camera: 0 }],
      scenes: [{ nodes: [0] }],
    } as GltfDocument;
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.camera-invalid-perspective');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstCamera).toBe(0);
  });

  it('drops and reports gltf.camera-invalid-orthographic for a bad view volume', () => {
    const doc = {
      asset: { version: '2.0' },
      cameras: [{ orthographic: { xmag: 0, ymag: 1, zfar: 10, znear: 0 }, type: 'orthographic' }],
      nodes: [{ camera: 0 }],
      scenes: [{ nodes: [0] }],
    } as GltfDocument;
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.camera-invalid-orthographic');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
  });

  it('drops and reports gltf.camera-missing-descriptor for a type with no descriptor', () => {
    const doc = {
      asset: { version: '2.0' },
      cameras: [{ type: 'perspective' }],
      nodes: [{ camera: 0 }],
      scenes: [{ nodes: [0] }],
    } as GltfDocument;
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.camera-missing-descriptor');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstType).toBe('perspective');
  });

  it('recovers and reports gltf.node-child-out-of-range for a child index outside the node table', () => {
    const doc = {
      asset: { version: '2.0' },
      nodes: [{ children: [9] }, {}],
      scenes: [{ nodes: [0, 1] }],
    } as GltfDocument;
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.node-child-out-of-range');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstChild).toBe(9);
  });

  it('drops and reports gltf.animation-target-unresolved for a channel targeting an out-of-range node', () => {
    const doc = makeTriangleGltf();
    doc.animations = [
      { channels: [{ sampler: 0, target: { node: 99, path: 'translation' } }], samplers: [{ input: 0, output: 0 }] },
    ];
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.animation-target-unresolved');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstTarget).toBe(99);
  });

  it('recovers and reports gltf.node-multiple-parents when two nodes claim the same child', () => {
    const doc = {
      asset: { version: '2.0' },
      nodes: [{ children: [2] }, { children: [2] }, {}],
      scenes: [{ nodes: [0, 1] }],
    } as GltfDocument;
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.node-multiple-parents');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstChild).toBe(2);
  });

  it('recovers and reports gltf.duplicate-extension-handler for two handlers of one kind', () => {
    const handler = { apply() {}, kind: 'VENDOR_x' };
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(makeTriangleGltf(), diagnostics, { extensionHandlers: [handler, handler] });
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.duplicate-extension-handler');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstKind).toBe('VENDOR_x');
  });

  it('drops and reports gltf.animation-missing-sampler for an out-of-range sampler', () => {
    const doc = makeTriangleGltf();
    doc.animations = [{ channels: [{ sampler: 9, target: { node: 0, path: 'translation' } }], samplers: [] }];
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.animation-missing-sampler');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstSampler).toBe(9);
  });

  it('skips and reports gltf.animation-unsupported-path for an unknown target path', () => {
    const doc = makeTriangleGltf();
    // 'color' is not a glTF 2.0 animation target path — cast past the closed union to exercise the branch.
    // input is the SCALAR indices accessor (times must be SCALAR); the unknown path has no required output
    // type, so the channel reaches the unsupported-path Skip rather than a type-mismatch drop.
    doc.animations = [
      {
        channels: [{ sampler: 0, target: { node: 0, path: 'color' as 'translation' } }],
        samplers: [{ input: 1, output: 0 }],
      },
    ];
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.animation-unsupported-path');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstPath).toBe('color');
  });

  it('drops and reports gltf.morph-target-no-position for a POSITION-less morph target', () => {
    const doc = makeTriangleGltf();
    doc.meshes![0].primitives[0].targets = [{ NORMAL: 0 }];
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.morph-target-no-position');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstTarget).toBe(0);
  });

  it('drops the whole morph set (not just the target) when a POSITION delta count mismatches the base', () => {
    // The morph target's POSITION delta accessor has count 1 against the base mesh's 3 vertices. A shorter
    // delta would blend past the base vertices, and dropping just this target would renumber the survivors,
    // so the WHOLE morph set drops (Drop) — the mesh keeps its base geometry but carries no morph.
    const doc = makeMorphGltf();
    doc.accessors![2].count = 1; // position-deltas accessor: 1 delta vs 3 base vertices
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.morph-target-count-mismatch');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.detail?.firstExpected).toBe(3);
    expect(crumb!.detail?.firstActual).toBe(1);
    expect((getNodeChildren(scene.root)[0] as unknown as Mesh).morph ?? null).toBeNull();
  });

  it('drops the whole morph set when any target faults so weight/target correspondence stays honest', () => {
    // Two targets whose weights are [0.25, 0.75]. Target 0's POSITION delta faults; dropping only it would
    // slide weight 0.75 onto index 0. Instead the whole set drops (Drop), so target↔weight↔animation indexing
    // never desynchronizes.
    const doc = makeMorphGltf();
    doc.meshes![0].primitives[0].targets = [{ POSITION: 99 }, { POSITION: 2 }]; // target 0 → missing accessor
    doc.meshes![0].weights = [0.25, 0.75];
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.morph-target-no-position');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.detail?.firstTarget).toBe(0);
    expect((getNodeChildren(scene.root)[0] as unknown as Mesh).morph ?? null).toBeNull();
  });

  it('recovers and reports gltf.buffer-empty (no-uri) for a uri-less buffer on the JSON path', () => {
    const doc = makeTriangleGltf();
    doc.buffers = [{ byteLength: 4 }]; // no uri, and no GLB binary on the JSON path
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.buffer-empty');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.reason).toBe('no-uri-no-binary');
  });

  it('recovers and reports gltf.accessor-buffer-not-found for an optional attribute with a missing buffer', () => {
    // POSITION stays valid so the mesh survives; an optional NORMAL points at a bufferView whose buffer is
    // absent. The failed optional attribute is treated as absent (finite zero-fill) and Recover-crumbed.
    const doc = makeTriangleGltf();
    doc.accessors!.push({ bufferView: 2, componentType: 5126, count: 3, type: 'VEC3' });
    doc.bufferViews!.push({ buffer: 9, byteLength: 36, byteOffset: 0 }); // buffers array has no index 9
    doc.meshes![0].primitives[0].attributes.NORMAL = 2;
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.accessor-buffer-not-found');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstBuffer).toBe(9);
    // The mesh is kept and drawable; the missing normals zero-fill to finite values.
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    for (const value of geometry.vertices) expect(Number.isFinite(value)).toBe(true);
  });

  it('recovers and reports gltf.accessor-count-mismatch for an optional attribute shorter than POSITION', () => {
    // A NORMAL accessor with count 1 against POSITION count 3 reads within the buffer (no past-buffer fault)
    // but its element count mismatches, so it is treated as absent (finite zero-fill) and Recover-crumbed with
    // the expected/actual counts.
    const doc = makeTriangleGltf();
    doc.accessors!.push({ bufferView: 0, componentType: 5126, count: 1, type: 'VEC3' });
    doc.meshes![0].primitives[0].attributes.NORMAL = 2;
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.accessor-count-mismatch');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstExpected).toBe(3);
    expect(crumb!.detail?.firstActual).toBe(1);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    for (const value of geometry.vertices) expect(Number.isFinite(value)).toBe(true);
  });

  it('drops an animation channel with an empty sampler instead of creating an empty track', () => {
    // A sampler whose time+value accessors are count 0 has no keyframes — no usable track survives, so the
    // channel drops (Drop). With that its only channel gone, the animation is not created at all.
    const doc = makeChannelGltf({
      interpolation: 'LINEAR',
      output: new Float32Array([0, 0, 0, 1]),
      outputCount: 1,
      outputType: 'VEC4',
      path: 'rotation',
      times: new Float32Array([0]),
    });
    doc.accessors![1].count = 0; // times accessor → empty
    doc.accessors![2].count = 0; // output accessor → empty
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.animation-sampler-empty');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(Object.keys(scene.animations)).toHaveLength(0);
  });

  it('drops an animation channel whose output element count mismatches the keyframe count', () => {
    // LINEAR rotation with 2 keyframes but only 1 VEC4 output element: flattened value length (4) is a
    // multiple of the keyframe count (2), so a length-based check wrongly admits it. Validate by ELEMENT
    // count and interpolation instead — LINEAR needs one output element per key — and drop the channel.
    const doc = makeChannelGltf({
      interpolation: 'LINEAR',
      output: new Float32Array([0, 0, 0, 1]),
      outputCount: 1, // one VEC4 output element…
      outputType: 'VEC4',
      path: 'rotation',
      times: new Float32Array([0, 1]), // …against two keyframes
    });
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.animation-sampler-cardinality');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(Object.keys(scene.animations)).toHaveLength(0);
  });

  it('drops a weights animation channel whose output width mismatches the morph target count', () => {
    // A weights sampler must pack one weight per morph target per key. This mesh has 1 target and 2 keys, so a
    // usable output is 2 scalars; supplying only 1 is malformed and drops the weights channel. (count 1 reads
    // within the backing buffer, so it is a genuine cardinality mismatch — not a past-buffer fault.)
    const doc = makeMorphGltf();
    doc.accessors![5].count = 1; // weight-values accessor: 1 scalar vs the required 1 target × 2 keys = 2
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.weights-cardinality-mismatch');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstExpected).toBe(2);
    expect(crumb!.detail?.firstActual).toBe(1);
    expect(Object.keys(scene.animations)).toHaveLength(0);
  });

  it('recovers and reports gltf.sparse-bufferview-not-found for a bad sparse bufferView', () => {
    const doc = makeTriangleGltf();
    doc.accessors![0].sparse = {
      count: 1,
      indices: { bufferView: 9, componentType: 5123 },
      values: { bufferView: 9 },
    };
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.sparse-bufferview-not-found');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('buildGltfDocument');
  });

  it('recovers and reports gltf.sparse-invalid-read for an oversized sparse count', () => {
    // A sparse.count far larger than the backing bufferViews can hold would read past the DataView and throw;
    // the bounds guard skips the override and keeps the base accessor data — the mesh survives with its base
    // vertices (Recover), never throws.
    const doc = makeTriangleGltf();
    doc.accessors![0].sparse = {
      count: 100,
      indices: { bufferView: 0, componentType: 5123 },
      values: { bufferView: 0 },
    };
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.sparse-invalid-read');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('buildGltfDocument');
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
  });

  it('drops an animation channel whose output accessor type mismatches the path', () => {
    // rotation output must be VEC4 (a quaternion); a VEC3 output has the right element count but the track
    // would sample four components from three-component tuples. Validate the TYPE, not just the count, and
    // drop the channel — so no animation is created.
    const doc = makeChannelGltf({
      interpolation: 'LINEAR',
      output: new Float32Array([0, 0, 0, 1, 2, 3]),
      outputCount: 2,
      outputType: 'VEC3', // wrong: rotation requires VEC4
      path: 'rotation',
      times: new Float32Array([0, 1]),
    });
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.accessor-type-mismatch');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(Object.keys(scene.animations)).toHaveLength(0);
  });

  it('recovers and reports gltf.accessor-type-mismatch for an optional attribute of the wrong type', () => {
    // POSITION (VEC3) survives; an optional NORMAL points at a VEC2 accessor where the reader expects VEC3.
    // A wrong-width attribute would mis-stride the read, so it is treated as absent (finite zero-fill) and
    // Recover-crumbed rather than silently reinterpreted.
    const doc = makeTriangleGltf();
    doc.accessors!.push({ bufferView: 0, componentType: 5126, count: 3, type: 'VEC2' });
    doc.meshes![0].primitives[0].attributes.NORMAL = 2;
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.accessor-type-mismatch');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('buildGltfDocument');
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    for (const value of geometry.vertices) expect(Number.isFinite(value)).toBe(true);
  });

  it('recovers and reports gltf.sparse-index-out-of-range for a sparse index past the accessor count', () => {
    // POSITION count 3 with a bounds-safe sparse payload whose destination index (99) exceeds the accessor
    // count. A typed-array write past the base length is silently ignored, so the override is skipped and the
    // base data kept (Recover) — the mesh imports normally.
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const sparseIndex = new Uint16Array([99]); // out of range for count 3
    const sparseValue = new Float32Array([9, 9, 9]);
    const uri = toDataUri(bytesOf(positions), bytesOf(sparseIndex), bytesOf(sparseValue));
    const posLen = positions.byteLength;
    const idxLen = sparseIndex.byteLength;
    const doc: GltfDocument = {
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          sparse: { count: 1, indices: { bufferView: 1, componentType: 5123 }, values: { bufferView: 2 } },
          type: 'VEC3',
        },
      ],
      asset: { version: '2.0' },
      bufferViews: [
        { buffer: 0, byteLength: posLen, byteOffset: 0 },
        { buffer: 0, byteLength: idxLen, byteOffset: posLen },
        { buffer: 0, byteLength: sparseValue.byteLength, byteOffset: posLen + idxLen },
      ],
      buffers: [{ byteLength: posLen + idxLen + sparseValue.byteLength, uri }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.sparse-index-out-of-range');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstIndex).toBe(99);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
  });

  it('drops the primitive when the POSITION accessor overruns its declared bufferView window', () => {
    // The backing buffer is long, but POSITION's bufferView declares only 4 bytes while the accessor needs 36.
    // A whole-buffer bounds check would read 32 bytes past the declared view into unrelated data; the window
    // bound faults the read instead, so the primitive drops rather than importing corrupt vertices.
    const doc = makeTriangleGltf();
    doc.bufferViews![0].byteLength = 4; // POSITION view: far too short for 3 × VEC3 (36 bytes)
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.primitive-no-position');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(isMesh(getNodeChildren(scene.root)[0] as Node3D)).toBe(false);
  });

  it('drops the primitive when the POSITION accessor starts before its declared bufferView window', () => {
    // The lower bound is the half of window containment an upper-bound check cannot see. A decoy sits in the
    // buffer immediately before POSITION's view; a negative accessor byteOffset walks the read back onto it,
    // and every "does it fit?" test still passes because the read ENDS inside the window. Unguarded, the
    // parser imports the decoy as vertex data with no diagnostic at all.
    const decoy = new Float32Array([91, 92, 93]);
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const doc: GltfDocument = {
      accessors: [{ bufferView: 0, byteOffset: -12, componentType: 5126, count: 3, type: 'VEC3' }],
      asset: { version: '2.0' },
      bufferViews: [{ buffer: 0, byteLength: positions.byteLength, byteOffset: decoy.byteLength }],
      buffers: [
        { byteLength: decoy.byteLength + positions.byteLength, uri: toDataUri(bytesOf(decoy), bytesOf(positions)) },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.primitive-no-position');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(isMesh(getNodeChildren(scene.root)[0] as Node3D)).toBe(false);
  });

  it('drops the primitive when the bufferView byteStride is narrower than one element', () => {
    // byteStride 4 against a 12-byte VEC3 element: every bound holds — three strided elements end 20 bytes
    // in, inside the declared view — but consecutive elements OVERLAP, so vertex 2 would import the tail of
    // vertex 1 shifted by one float. Width is an invariant the window bounds cannot express.
    const packed = new Float32Array([0, 0, 0, 7, 8]);
    const doc: GltfDocument = {
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      asset: { version: '2.0' },
      bufferViews: [{ buffer: 0, byteLength: packed.byteLength, byteOffset: 0, byteStride: 4 }],
      buffers: [{ byteLength: packed.byteLength, uri: toDataUri(bytesOf(packed)) }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.primitive-no-position');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(isMesh(getNodeChildren(scene.root)[0] as Node3D)).toBe(false);
  });

  it('drops the primitive when the POSITION accessor count is not a whole nonnegative number', () => {
    // The count sizes the allocation, and neither malformed value is reachable by a bounds check. A
    // FRACTIONAL count silently truncates the typed array (2.5 VEC3 → 7 floats) while the read loop still
    // runs three times, so the last vertex writes off the end and vanishes and a fractional vertex count
    // flows downstream. A NEGATIVE count throws RangeError out of the allocation and takes the entire
    // import with it. Validating before allocating turns both into an ordinary per-primitive Drop.
    for (const count of [2.5, -3]) {
      const doc = makeTriangleGltf();
      doc.accessors![0].count = count;
      const diagnostics: ImportDiagnostic[] = [];
      const scene = createScene3DFromGltf(doc, diagnostics);
      const crumb = findGltfDiagnostic(diagnostics, 'gltf.primitive-no-position');
      expect(crumb).toBeDefined();
      expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
      expect(isMesh(getNodeChildren(scene.root)[0] as Node3D)).toBe(false);
    }
  });

  it('recovers and reports gltf.sparse-invalid-read for a sparse values read starting before its window', () => {
    // The same lower-bound hole on the override lane: a decoy precedes the values view and a negative
    // sparse.values.byteOffset reads it as vertex 1's replacement. The base accessor data is intact, so the
    // override is skipped and the mesh keeps its base vertices — Recover, not Drop.
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const sparseIndices = new Uint16Array([1]);
    const decoy = new Float32Array([91, 92, 93]);
    const sparseValues = new Float32Array([9, 9, 9]);
    const posLen = positions.byteLength;
    const idxLen = sparseIndices.byteLength;
    const doc: GltfDocument = {
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          sparse: {
            count: 1,
            indices: { bufferView: 1, componentType: 5123 },
            values: { bufferView: 2, byteOffset: -12 },
          },
          type: 'VEC3',
        },
      ],
      asset: { version: '2.0' },
      bufferViews: [
        { buffer: 0, byteLength: posLen, byteOffset: 0 },
        { buffer: 0, byteLength: idxLen, byteOffset: posLen },
        { buffer: 0, byteLength: sparseValues.byteLength, byteOffset: posLen + idxLen + decoy.byteLength },
      ],
      buffers: [
        {
          byteLength: posLen + idxLen + decoy.byteLength + sparseValues.byteLength,
          uri: toDataUri(bytesOf(positions), bytesOf(sparseIndices), bytesOf(decoy), bytesOf(sparseValues)),
        },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.sparse-invalid-read');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    const p = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 1);
    expect([p.x, p.y, p.z]).toEqual([1, 0, 0]); // the base value, not the decoy
  });

  it('aggregates repeated accessor-not-found recoveries into one crumb with a count', () => {
    const doc = makeTriangleGltf();
    // POSITION stays valid so the primitive survives; two non-position attributes point at a missing
    // accessor 99 → two recoveries of the same kind, aggregated into one crumb.
    doc.meshes![0].primitives[0].attributes.NORMAL = 99;
    doc.meshes![0].primitives[0].attributes.TANGENT = 99;
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const matching = diagnostics.filter((d) => d.kind === 'gltf.accessor-not-found');
    expect(matching).toHaveLength(1);
    expect(matching[0].detail?.count).toBeGreaterThanOrEqual(2);
    expect(matching[0].detail?.firstAccessor).toBe(99);
  });

  it('emits no diagnostics when no collector array is supplied', () => {
    const doc = makeTriangleGltf();
    doc.meshes![0].primitives[0].attributes.POSITION = 99;
    doc.asset = { version: '3.0' };
    expect(() => createScene3DFromGltf(doc)).not.toThrow();
  });

  it('drops and reports gltf.image-malformed-uri for a data: URI with no comma', () => {
    const doc = { asset: { version: '2.0' }, images: [{ uri: 'data:image/png;base64' }], scenes: [] } as GltfDocument;
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.image-malformed-uri');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstImage).toBe(0);
  });

  it('drops and reports gltf.image-bufferview-out-of-range for an image bufferView outside the table', () => {
    const doc = { asset: { version: '2.0' }, images: [{ bufferView: 9 }], scenes: [] } as GltfDocument;
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.image-bufferview-out-of-range');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstBufferView).toBe(9);
  });

  it('drops and reports gltf.image-bufferview-out-of-range for an image bufferView starting before its buffer', () => {
    // `Uint8Array.slice` is bounds-safe upward but a NEGATIVE start counts back from the END of the buffer,
    // so an out-of-spec byteOffset silently hands the decoder unrelated tail bytes instead of the declared
    // window. The same lower-bound rule the accessor reads apply covers the image lane.
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const doc: GltfDocument = {
      asset: { version: '2.0' },
      bufferViews: [{ buffer: 0, byteLength: 4, byteOffset: -4 }],
      buffers: [{ byteLength: payload.byteLength, uri: toDataUri(payload) }],
      images: [{ bufferView: 0, mimeType: 'image/png' }],
      scenes: [],
    };
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.image-bufferview-out-of-range');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.detail?.firstImage).toBe(0);
  });

  it('drops and reports gltf.image-no-source for an image with neither uri nor bufferView', () => {
    const doc = { asset: { version: '2.0' }, images: [{}], scenes: [] } as GltfDocument;
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.image-no-source');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstImage).toBe(0);
  });

  it('recovers and reports gltf.texture-source-missing for a material texture whose texture has no source', () => {
    const doc = {
      asset: { version: '2.0' },
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      scenes: [],
      textures: [{}],
    } as GltfDocument;
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.texture-source-missing');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstTexture).toBe(0);
  });

  it('recovers and reports gltf.texture-image-unresolved for a material texture whose image failed to build', () => {
    const doc = {
      asset: { version: '2.0' },
      images: [{}], // no source → image resource is null
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      scenes: [],
      textures: [{ source: 0 }],
    } as GltfDocument;
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromGltf(doc, diagnostics);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.texture-image-unresolved');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('buildGltfDocument');
    expect(crumb!.detail?.firstImage).toBe(0);
  });
});

describe('parseGlb', () => {
  it('parses a GLB container into a Scene3DDocument decomposition', () => {
    const positions = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const binary = bytesOf(positions);
    const doc: GltfDocument = {
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      asset: { version: '2.0' },
      bufferViews: [{ buffer: 0, byteLength: positions.byteLength, byteOffset: 0 }],
      buffers: [{ byteLength: positions.byteLength }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };
    const document = parseGlb(buildGlb(doc, binary));
    expect(document.meshes).toHaveLength(1);
    expect(document.nodes).toHaveLength(1);
    expect(document.nodes[0].mesh).toBe(0);
    expect(document.scenes[0].rootNodes).toEqual([0]);
  });

  it('returns an empty document for a malformed container', () => {
    const document = parseGlb(new Uint8Array([1, 2, 3]));
    expect(document.nodes).toHaveLength(0);
    expect(document.scenes).toHaveLength(0);
  });
});

describe('parseGltf', () => {
  it('decomposes a glTF document into index-referenced tables with inline geometry', () => {
    const document = parseGltf(makeTriangleGltf());
    expect(document.meshes).toHaveLength(1);
    expect(getMeshGeometryVertexCount(document.meshes[0].geometry)).toBe(3);
    expect(document.nodes[0].mesh).toBe(0);
    expect(document.nodes[0].transform.position.x).toBe(5);
  });

  it('preserves placed perspective and orthographic cameras with clip planes', () => {
    const document = parseGltf({
      asset: { version: '2.0' },
      cameras: [
        { name: 'view', perspective: { aspectRatio: 1.5, yfov: 1, znear: 0.1 }, type: 'perspective' },
        { orthographic: { xmag: 4, ymag: 3, zfar: 50, znear: 0 }, type: 'orthographic' },
      ],
      nodes: [
        { camera: 0, children: [1], translation: [1, 2, 3] },
        { camera: 1, translation: [4, 5, 6] },
      ],
      scenes: [{ nodes: [0] }],
    });

    expect(document.cameras).toHaveLength(2);
    expect(document.cameras[0]).toMatchObject({ far: Number.POSITIVE_INFINITY, name: 'view', near: 0.1, node: 0 });
    expect(document.cameras[0].projection).toEqual({ aspect: 1.5, fovY: 1, kind: 'perspective' });
    expect(document.cameras[0].transform.position).toMatchObject({ x: 1, y: 2, z: 3 });
    expect(document.cameras[1]).toMatchObject({ far: 50, near: 0, node: 1 });
    expect(document.cameras[1].projection).toEqual({ halfHeight: 3, halfWidth: 4, kind: 'orthographic' });
    expect(document.cameras[1].transform.position).toMatchObject({ x: 5, y: 7, z: 9 });
  });

  it('resolves deeply nested camera placement without using the call stack', () => {
    const depth = 2048;
    const nodes: NonNullable<GltfDocument['nodes']> = Array.from({ length: depth }, (_, index) => ({
      camera: index === depth - 1 ? 0 : undefined,
      children: index + 1 < depth ? [index + 1] : undefined,
      translation: [1, 0, 0],
    }));
    const document = parseGltf({
      asset: { version: '2.0' },
      cameras: [{ perspective: { yfov: 1, znear: 0.1 }, type: 'perspective' }],
      nodes,
      scenes: [{ nodes: [0] }],
    });
    expect(document.cameras[0].transform.position.x).toBe(depth);
  });

  it('breaks a malformed camera-node cycle deterministically', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseGltf(
      {
        asset: { version: '2.0' },
        cameras: [{ perspective: { yfov: 1, znear: 0.1 }, type: 'perspective' }],
        nodes: [
          { camera: 0, children: [1], translation: [1, 0, 0] },
          { children: [0], translation: [2, 0, 0] },
        ],
        scenes: [{ nodes: [0] }],
      },
      diagnostics,
    );
    expect(Number.isFinite(document.cameras[0].transform.position.x)).toBe(true);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.node-hierarchy-cycle');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('buildGltfDocument');
  });

  it('expands a multi-primitive mesh into a group node with per-primitive child mesh nodes', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const uri = toDataUri(bytesOf(positions));
    const doc: GltfDocument = {
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      asset: { version: '2.0' },
      bufferViews: [{ buffer: 0, byteLength: positions.byteLength, byteOffset: 0 }],
      buffers: [{ byteLength: positions.byteLength, uri }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }, { attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
    };
    const document = parseGltf(doc);
    expect(document.meshes).toHaveLength(2);
    // Node 0 is a group with two child mesh nodes (one per primitive).
    expect(document.nodes[0].mesh).toBeUndefined();
    expect(document.nodes[0].children).toHaveLength(2);
    expect(document.nodes[document.nodes[0].children[0]].mesh).toBe(0);
    expect(document.nodes[document.nodes[0].children[1]].mesh).toBe(1);
  });

  it('carries a skin as joint node indices plus inverse-bind matrices', () => {
    const document = parseGltf(makeSkinnedGltf());
    expect(document.skins).toHaveLength(1);
    expect(document.skins[0].joints.length).toBeGreaterThan(0);
    expect(document.skins[0].inverseBind.length).toBe(document.skins[0].joints.length);
  });

  it('returns an empty document and warns for invalid JSON', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseGltf('{ not json', diagnostics);
    expect(document.nodes).toHaveLength(0);
    const crumb = findGltfDiagnostic(diagnostics, 'gltf.invalid-json');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Reject);
    expect(crumb!.origin).toBe('parseGltfSource');
  });
});

describe('parseGltf basisu texture source', () => {
  function makeBasisuGltf(withFallback: boolean): GltfDocument {
    const texture: Record<string, unknown> = { extensions: { KHR_texture_basisu: { source: 1 } }, sampler: 0 };
    // Under KHR_texture_basisu the plain `source` is an OPTIONAL fallback, so most real files omit it.
    if (withFallback) texture.source = 0;
    return {
      asset: { version: '2.0' },
      images: [{ uri: 'fallback.png' }, { mimeType: 'image/ktx2', uri: 'compressed.ktx2' }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      samplers: [{}],
      scenes: [{ nodes: [] }],
      textures: [texture],
    } as unknown as GltfDocument;
  }

  it('resolves the basisu image source in preference to the fallback', () => {
    const document = parseGltf(makeBasisuGltf(true));
    const material = document.materials[0] as unknown as { baseColorMap: { resource: unknown } | null };
    const resource = getTestTextureResource(document.resources, material.baseColorMap as never);

    expect((resource as ExternalImageResourceReference).uri).toBe('compressed.ktx2');
  });

  it('resolves a basisu texture that carries no fallback source at all', () => {
    // Reading only `source` dropped the map entirely here — the texture is not missing, it is elsewhere.
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseGltf(makeBasisuGltf(false), diagnostics);
    const material = document.materials[0] as unknown as { baseColorMap: unknown | null };

    expect(material.baseColorMap).not.toBeNull();
    expect(diagnostics.find((d) => d.kind === 'gltf.texture-source-missing')).toBeUndefined();
  });

  it('still recovers when a texture genuinely has no source anywhere', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const source = makeBasisuGltf(false);
    (source.textures as Record<string, unknown>[])[0] = { sampler: 0 };
    parseGltf(source, diagnostics);

    expect(diagnostics.find((d) => d.kind === 'gltf.texture-source-missing')).toBeDefined();
  });
});

describe('parseGltf mesh quantization', () => {
  // A quantized POSITION accessor: normalized signed shorts, which the base spec forbids for POSITION and
  // KHR_mesh_quantization permits. Three vertices at the short extremes so the normalization is visible.
  function makeQuantizedGltf(required: boolean): GltfDocument {
    const positions = new Int16Array([0, 0, 0, 32767, 0, 0, 0, 32767, 0]);
    const indices = new Uint16Array([0, 1, 2]);
    const buffer = new Uint8Array(positions.byteLength + indices.byteLength);
    buffer.set(new Uint8Array(positions.buffer), 0);
    buffer.set(new Uint8Array(indices.buffer), positions.byteLength);
    let binary = '';
    for (let i = 0; i < buffer.length; i++) binary += String.fromCharCode(buffer[i]);

    const source = {
      accessors: [
        { bufferView: 0, componentType: 5122, count: 3, normalized: true, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      ],
      asset: { version: '2.0' },
      bufferViews: [
        { buffer: 0, byteLength: positions.byteLength, byteOffset: 0 },
        { buffer: 0, byteLength: indices.byteLength, byteOffset: positions.byteLength },
      ],
      buffers: [{ byteLength: buffer.length, uri: `data:application/octet-stream;base64,${btoa(binary)}` }],
      extensionsUsed: ['KHR_mesh_quantization'],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
    } as unknown as GltfDocument;
    if (required) (source as { extensionsRequired?: string[] }).extensionsRequired = ['KHR_mesh_quantization'];
    return source;
  }

  it('reads a quantized position accessor through the existing normalization path', () => {
    const document = parseGltf(makeQuantizedGltf(false));

    expect(document.meshes).toHaveLength(1);
    const position = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(position, document.meshes[0].geometry, 1);
    // A normalized signed short at its maximum is 1.0 — the spec mapping the reader already applies.
    expect(position.x).toBeCloseTo(1, 4);
    expect(position.y).toBeCloseTo(0, 4);
  });

  it('does not report the extension unsupported when a file requires it', () => {
    // The core satisfies KHR_mesh_quantization with no handler, so requiring it must not crumb.
    const diagnostics: ImportDiagnostic[] = [];
    parseGltf(makeQuantizedGltf(true), diagnostics);

    expect(diagnostics.find((d) => d.kind === 'gltf.unsupported-required-extension')).toBeUndefined();
  });

  it('still reports an extension nothing satisfies', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const source = makeQuantizedGltf(false);
    (source as { extensionsRequired?: string[] }).extensionsRequired = ['KHR_draco_mesh_compression'];
    parseGltf(source, diagnostics);

    expect(diagnostics.find((d) => d.kind === 'gltf.unsupported-required-extension')).toBeDefined();
  });
});
