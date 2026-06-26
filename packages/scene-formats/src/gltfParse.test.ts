import { getMeshGeometryIndexCount, getMeshGeometryVertexCount } from '@flighthq/mesh';
import { getNodeChildren } from '@flighthq/node';
import { isMesh } from '@flighthq/scene';
import type { Mesh, SceneNode } from '@flighthq/types';

import { createSceneFromGltf } from './gltfParse';
import type { GltfDocument } from './gltfSchema';

// A single triangle (3 positions) with a ushort index buffer, embedded as a base64 data URI, on a node
// translated to (5, 0, 0).
function makeTriangleGltf(): GltfDocument {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const bytes = new Uint8Array(positions.byteLength + indices.byteLength);
  bytes.set(new Uint8Array(positions.buffer), 0);
  bytes.set(new Uint8Array(indices.buffer), positions.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const uri = `data:application/octet-stream;base64,${btoa(binary)}`;

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
    buffers: [{ byteLength: bytes.length, uri }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes: [{ mesh: 0, translation: [5, 0, 0] }],
    scene: 0,
    scenes: [{ nodes: [0] }],
  };
}

// A two-node parent-child scene: node 0 is a plain container (children:[1]), node 1 is a mesh node
// with positions-only geometry (no indices). Uses an empty data URI so no real buffer decode is needed.
function makeParentChildGltf(): GltfDocument {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const bytes = new Uint8Array(positions.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const uri = `data:application/octet-stream;base64,${btoa(binary)}`;

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

describe('createSceneFromGltf', () => {
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
    expect(warnings[0]).toContain('99');
  });

  it('collects a warning when bufferViews are missing', () => {
    const doc = makeTriangleGltf();
    // Clear bufferViews so accessor.bufferView references a missing entry.
    doc.bufferViews = [];
    const warnings: string[] = [];
    createSceneFromGltf(doc, warnings);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('bufferView');
  });

  it('returns a scene for a document with no nodes', () => {
    const scene = createSceneFromGltf({ asset: { version: '2.0' } });
    expect(getNodeChildren(scene)).toHaveLength(0);
  });
});
