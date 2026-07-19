import { createAabb, setVector3 } from '@flighthq/geometry';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node';

import { createMesh } from './mesh';
import { createSceneNode } from './sceneNode';
import { getSceneNodeWorldBounds } from './sceneNodeBounds';

describe('getSceneNodeWorldBounds', () => {
  it('sets an empty box when the node has no Mesh geometry', () => {
    const node = createSceneNode();
    const out = createAabb();
    getSceneNodeWorldBounds(out, node);
    expect(out.min.x).toBe(Number.POSITIVE_INFINITY);
    expect(out.max.x).toBe(Number.NEGATIVE_INFINITY);
  });

  it('returns an empty box when a scene with only group nodes has no meshes', () => {
    const root = createSceneNode();
    addNodeChild(root, createSceneNode());
    addNodeChild(root, createSceneNode());
    const out = createAabb();
    getSceneNodeWorldBounds(out, root);
    expect(out.min.x).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns the world-space bounds of a single Mesh at the origin', () => {
    const mesh = createMesh(createBoxMeshGeometry(), []);
    const out = createAabb();
    getSceneNodeWorldBounds(out, mesh);
    // A default box is centered at origin with half-extents 0.5 in each axis.
    expect(out.min.x).toBeCloseTo(-0.5);
    expect(out.min.y).toBeCloseTo(-0.5);
    expect(out.min.z).toBeCloseTo(-0.5);
    expect(out.max.x).toBeCloseTo(0.5);
    expect(out.max.y).toBeCloseTo(0.5);
    expect(out.max.z).toBeCloseTo(0.5);
  });

  it('translates bounds when the Mesh is offset', () => {
    const mesh = createMesh(createBoxMeshGeometry(), []);
    setVector3(mesh.position, 10, 0, 0);
    invalidateNodeLocalTransform(mesh);
    const out = createAabb();
    getSceneNodeWorldBounds(out, mesh);
    expect(out.min.x).toBeCloseTo(9.5);
    expect(out.max.x).toBeCloseTo(10.5);
  });

  it('accumulates bounds from multiple Mesh children', () => {
    const root = createSceneNode();
    const meshA = createMesh(createBoxMeshGeometry(), []);
    const meshB = createMesh(createBoxMeshGeometry(), []);
    setVector3(meshA.position, -5, 0, 0);
    invalidateNodeLocalTransform(meshA);
    setVector3(meshB.position, 5, 0, 0);
    invalidateNodeLocalTransform(meshB);
    addNodeChild(root, meshA);
    addNodeChild(root, meshB);
    const out = createAabb();
    getSceneNodeWorldBounds(out, root);
    expect(out.min.x).toBeCloseTo(-5.5);
    expect(out.max.x).toBeCloseTo(5.5);
  });

  it('accumulates bounds recursively through group nodes', () => {
    const root = createSceneNode();
    const group = createSceneNode();
    const leaf = createMesh(createBoxMeshGeometry(), []);
    setVector3(leaf.position, 3, 0, 0);
    invalidateNodeLocalTransform(leaf);
    addNodeChild(root, group);
    addNodeChild(group, leaf);
    const out = createAabb();
    getSceneNodeWorldBounds(out, root);
    expect(out.min.x).toBeCloseTo(2.5);
    expect(out.max.x).toBeCloseTo(3.5);
  });

  it('is alias-safe (out can be any pre-existing Aabb)', () => {
    const mesh = createMesh(createBoxMeshGeometry(), []);
    const out = createAabb(0, 0, 0, 0, 0, 0);
    getSceneNodeWorldBounds(out, mesh);
    expect(out.min.x).toBeCloseTo(-0.5);
  });
});
