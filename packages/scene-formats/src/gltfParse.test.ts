import {
  getMeshGeometryIndexCount,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexTangent,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh';
import { getNodeChildren } from '@flighthq/node';
import { isMesh } from '@flighthq/scene';
import type {
  EmbeddedSceneResourceRef,
  ExternalSceneResourceRef,
  Mesh,
  SceneNode,
  StandardPbrMaterial,
} from '@flighthq/types';
import { StandardPbrMaterialKind } from '@flighthq/types';

import { createSceneFromGlb, createSceneFromGltf } from './gltfParse';
import type { GltfDocument } from './gltfSchema';

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

describe('createSceneFromGlb', () => {
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
    const scene = createSceneFromGlb(buildGlb(doc, binary));

    const meshNode = getNodeChildren(scene)[0] as SceneNode;
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
    const warnings: string[] = [];
    const scene = createSceneFromGlb(bogus, warnings);
    expect(getNodeChildren(scene)).toHaveLength(0);
    expect(warnings.some((w) => w.includes('magic'))).toBe(true);
  });

  it('returns an empty scene and warns when the byte length is below the header size', () => {
    const warnings: string[] = [];
    const scene = createSceneFromGlb(new Uint8Array(4), warnings);
    expect(getNodeChildren(scene)).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe('createSceneFromGltf', () => {
  it('decodes a glTF material to a StandardPbrMaterial carrying its metallic-roughness factors', () => {
    const doc = makeTriangleGltf();
    doc.materials = [
      {
        alphaCutoff: 0.3,
        alphaMode: 'MASK',
        doubleSided: true,
        emissiveFactor: [0, 1, 0],
        pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1], metallicFactor: 0.25, roughnessFactor: 0.75 },
      },
    ];
    doc.meshes![0].primitives[0].material = 0;

    const mesh = getNodeChildren(createSceneFromGltf(doc))[0] as Mesh;
    expect(mesh.materials).toHaveLength(1);
    const mat = mesh.materials[0] as StandardPbrMaterial;
    expect(mat.kind).toBe(StandardPbrMaterialKind);
    expect(mat.baseColor).toBe(0xff0000ff);
    expect(mat.emissive).toBe(0x00ff00ff); // emissiveFactor widened to opaque
    expect(mat.metallic).toBe(0.25);
    expect(mat.roughness).toBe(0.75);
    expect(mat.alphaMode).toBe('mask');
    expect(mat.alphaCutoff).toBe(0.3);
    expect(mat.doubleSided).toBe(true);
  });

  it('applies glTF metallic-roughness spec defaults when factors are absent', () => {
    const doc = makeTriangleGltf();
    doc.materials = [{}];
    doc.meshes![0].primitives[0].material = 0;

    const mat = (getNodeChildren(createSceneFromGltf(doc))[0] as Mesh).materials[0] as StandardPbrMaterial;
    expect(mat.baseColor).toBe(0xffffffff); // default [1,1,1,1]
    expect(mat.metallic).toBe(1);
    expect(mat.roughness).toBe(1);
    expect(mat.alphaMode).toBe('opaque');
  });

  it('resolves a baseColorTexture data-URI image to an Embedded texture ref', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const doc = makeTriangleGltf();
    doc.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }];
    doc.textures = [{ source: 0 }];
    doc.images = [{ uri: imageDataUri('image/png', png) }];
    doc.meshes![0].primitives[0].material = 0;

    const mat = (getNodeChildren(createSceneFromGltf(doc))[0] as Mesh).materials[0] as StandardPbrMaterial;
    expect(mat.baseColorMap!.image).toBeNull();
    const ref = mat.baseColorMap!.resource as EmbeddedSceneResourceRef;
    expect(ref.kind).toBe('Embedded');
    expect(ref.mimeType).toBe('image/png');
    expect(Array.from(ref.bytes)).toEqual(Array.from(png));
  });

  it('resolves an external-URI image to an External texture ref', () => {
    const doc = makeTriangleGltf();
    doc.materials = [{ emissiveTexture: { index: 0 } }];
    doc.textures = [{ source: 0 }];
    doc.images = [{ uri: 'textures/emissive.png' }];
    doc.meshes![0].primitives[0].material = 0;

    const mat = (getNodeChildren(createSceneFromGltf(doc))[0] as Mesh).materials[0] as StandardPbrMaterial;
    const ref = mat.emissiveMap!.resource as ExternalSceneResourceRef;
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

    const mat = (getNodeChildren(createSceneFromGltf(doc))[0] as Mesh).materials[0] as StandardPbrMaterial;
    expect(mat.normalScale).toBe(2);
    const ref = mat.normalMap!.resource as EmbeddedSceneResourceRef;
    expect(ref.kind).toBe('Embedded');
    expect(ref.mimeType).toBe('image/png');
    expect(Array.from(ref.bytes)).toEqual(Array.from(png));
  });

  it('leaves a primitive unmaterialed when it references no material', () => {
    const mesh = getNodeChildren(createSceneFromGltf(makeTriangleGltf()))[0] as Mesh;
    expect(mesh.materials).toHaveLength(0);
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

    const geometry = (getNodeChildren(createSceneFromGltf(doc))[0] as Mesh).geometry;
    const p = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 0);
    expect([p.x, p.y, p.z]).toEqual([0, 0, 0]);
    getMeshGeometryVertexPosition(p, geometry, 1);
    expect([p.x, p.y, p.z]).toEqual([9, 9, 9]); // overridden by the sparse block
    getMeshGeometryVertexPosition(p, geometry, 2);
    expect([p.x, p.y, p.z]).toEqual([0, 1, 0]);
  });

  it('accepts a JSON string as well as a parsed object', () => {
    const scene = createSceneFromGltf(JSON.stringify(makeTriangleGltf()));
    expect(getNodeChildren(scene)).toHaveLength(1);
  });

  it('builds the correct hierarchy for a 2-node parent-child scene', () => {
    const scene = createSceneFromGltf(makeParentChildGltf());

    const roots = getNodeChildren(scene);
    expect(roots).toHaveLength(1);

    const node0 = roots[0] as SceneNode;
    expect(isMesh(node0)).toBe(false);

    const node0Children = getNodeChildren(node0);
    expect(node0Children).toHaveLength(1);

    const node1 = node0Children[0] as SceneNode;
    expect(isMesh(node1)).toBe(true);
  });

  it('builds the node hierarchy with the imported mesh and transform', () => {
    const scene = createSceneFromGltf(makeTriangleGltf());

    const children = getNodeChildren(scene);
    expect(children).toHaveLength(1);

    const meshNode = children[0] as SceneNode;
    expect(isMesh(meshNode)).toBe(true);
    expect(meshNode.localMatrix.m[12]).toBeCloseTo(5); // translation x

    const geometry = (meshNode as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    expect(getMeshGeometryIndexCount(geometry)).toBe(3);
  });

  it('collects a warning when an accessor index is out of bounds', () => {
    const doc = makeTriangleGltf();
    // Point the POSITION attribute to accessor index 99, which does not exist in the array.
    doc.meshes![0].primitives[0].attributes.POSITION = 99;
    const warnings: string[] = [];
    createSceneFromGltf(doc, warnings);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes('99'))).toBe(true);
  });

  it('collects a warning when bufferViews are missing', () => {
    const doc = makeTriangleGltf();
    // Clear bufferViews so accessor.bufferView references a missing entry.
    doc.bufferViews = [];
    const warnings: string[] = [];
    createSceneFromGltf(doc, warnings);
    expect(warnings.some((w) => w.includes('bufferView'))).toBe(true);
  });

  it('returns a scene for a document with no nodes', () => {
    const scene = createSceneFromGltf({ asset: { version: '2.0' } });
    expect(getNodeChildren(scene)).toHaveLength(0);
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
    const geometry = (getNodeChildren(createSceneFromGltf(doc))[0] as Mesh).geometry;

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
    const geometry = (getNodeChildren(createSceneFromGltf(doc))[0] as Mesh).geometry;

    const n = { x: 0, y: 0, z: 0 };
    const uv = { x: 0, y: 0 };
    getMeshGeometryVertexNormal(n, geometry, 0);
    getMeshGeometryVertexUv0(uv, geometry, 0);
    expect([n.x, n.y, n.z]).toEqual([1, -1, 0]);
    expect([uv.x, uv.y]).toEqual([1, 0]);
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
    const groupNode = getNodeChildren(createSceneFromGltf(doc))[0] as SceneNode;

    // A multi-primitive mesh node is a transform-only group with one Mesh child per primitive.
    expect(isMesh(groupNode)).toBe(false);
    const subMeshes = getNodeChildren(groupNode);
    expect(subMeshes).toHaveLength(2);
    expect(isMesh(subMeshes[0] as SceneNode)).toBe(true);
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
    const geometry = (getNodeChildren(createSceneFromGltf(doc))[0] as Mesh).geometry;

    const t = { w: 0, x: 0, y: 0, z: 0 };
    getMeshGeometryVertexTangent(t, geometry, 1);
    expect([t.x, t.y, t.z, t.w]).toEqual([0, 1, 0, -1]);
  });

  it('zero-fills the tangent slot when a primitive has no TANGENT attribute', () => {
    const geometry = (getNodeChildren(createSceneFromGltf(makeTriangleGltf()))[0] as Mesh).geometry;
    const t = { w: 0, x: 0, y: 0, z: 0 };
    getMeshGeometryVertexTangent(t, geometry, 0);
    expect([t.x, t.y, t.z, t.w]).toEqual([0, 0, 0, 0]);
  });

  it('returns an empty scene and warns on malformed JSON instead of throwing', () => {
    const warnings: string[] = [];
    let scene;
    expect(() => {
      scene = createSceneFromGltf('{ this is not valid json', warnings);
    }).not.toThrow();
    expect(getNodeChildren(scene!)).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('warns when asset.version has an unsupported major version', () => {
    const doc = makeTriangleGltf();
    doc.asset = { version: '3.0' };
    const warnings: string[] = [];
    createSceneFromGltf(doc, warnings);
    expect(warnings.some((w) => w.includes('version'))).toBe(true);
  });

  it('warns when a primitive mode is not triangles', () => {
    const doc = makeTriangleGltf();
    doc.meshes![0].primitives[0].mode = 1; // LINES
    const warnings: string[] = [];
    createSceneFromGltf(doc, warnings);
    expect(warnings.some((w) => w.includes('mode'))).toBe(true);
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
    const meshNode = getNodeChildren(createSceneFromGltf(doc))[0] as SceneNode;
    const m = meshNode.localMatrix.m;
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
    const meshNode = getNodeChildren(createSceneFromGltf(doc))[0] as SceneNode;
    const m = meshNode.localMatrix.m;
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
    const meshNode = getNodeChildren(createSceneFromGltf(doc))[0] as SceneNode;
    const m = meshNode.localMatrix.m;
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
    const geometry = (getNodeChildren(createSceneFromGltf(doc))[0] as Mesh).geometry;
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
    const scene = createSceneFromGltf(doc);
    const roots = getNodeChildren(scene);
    // Scene 1 has only node 1 (the mesh node), not node 0.
    expect(roots).toHaveLength(1);
    expect(isMesh(roots[0] as SceneNode)).toBe(true);
  });

  it('warns when extensionsRequired names an unsupported extension', () => {
    const doc = makeTriangleGltf();
    doc.extensionsRequired = ['KHR_draco_mesh_compression'];
    const warnings: string[] = [];
    createSceneFromGltf(doc, warnings);
    expect(warnings.some((w) => w.includes('KHR_draco_mesh_compression'))).toBe(true);
  });

  it('imports a skin binding the mesh to a skeleton over its joint nodes', () => {
    const scene = createSceneFromGltf(makeSkinnedGltf());
    const roots = getNodeChildren(scene);
    const meshNode = roots[0] as unknown as Mesh;
    const jointNode = roots[1] as SceneNode;

    expect(isMesh(roots[0] as SceneNode)).toBe(true);
    expect(meshNode.skin).toBeTruthy();
    expect(meshNode.skin?.skeleton.joints).toHaveLength(1);
    // The skin's joint resolves to the built SceneNode, and its name carries through.
    expect(meshNode.skin?.skeleton.joints[0]).toBe(jointNode);
    expect(meshNode.skin?.skeleton.names).toEqual(['joint']);
  });

  it('emits the skinned layout with renormalized weights for a skinned primitive', () => {
    const scene = createSceneFromGltf(makeSkinnedGltf());
    const geometry = (getNodeChildren(scene)[0] as unknown as Mesh).geometry;

    expect(geometry.layout.stride).toBe(80);
    // joints0 at float 12, weights0 at float 16; vertex 0 is fully weighted to joint 0.
    expect(geometry.vertices[12]).toBe(0);
    expect(geometry.vertices[16]).toBeCloseTo(1);
  });

  it('defaults inverse-bind matrices to identity when the skin omits them', () => {
    const scene = createSceneFromGltf(makeSkinnedGltf(false));
    const meshNode = getNodeChildren(scene)[0] as unknown as Mesh;
    const inverseBind = meshNode.skin?.skeleton.inverseBindMatrices;

    expect(inverseBind?.length).toBe(16);
    // Identity: diagonal ones, off-diagonal zeros.
    expect(inverseBind?.[0]).toBe(1);
    expect(inverseBind?.[5]).toBe(1);
    expect(inverseBind?.[10]).toBe(1);
    expect(inverseBind?.[15]).toBe(1);
    expect(inverseBind?.[1]).toBe(0);
  });

  it('leaves an unskinned primitive on the canonical layout with no skin', () => {
    const scene = createSceneFromGltf(makeTriangleGltf());
    const meshNode = getNodeChildren(scene)[0] as unknown as Mesh;

    expect(meshNode.skin ?? null).toBeNull();
    expect(meshNode.geometry.layout.stride).toBe(48);
  });
});
