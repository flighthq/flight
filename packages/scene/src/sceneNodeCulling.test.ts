import { createFrustum, createMatrix4, setVector3 } from '@flighthq/geometry';
import { createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node';

import { createMesh } from './mesh';
import { createScene } from './scene';
import { createSceneNode } from './sceneNode';
import { buildSceneFrustum, cullSceneNodeByFrustum } from './sceneNodeCulling';

// Builds a simple box geometry centered at origin with side 2 (bounds [-1,-1,-1] to [1,1,1]).
function makeBoxGeometry() {
  return createMeshGeometry({
    layout: {
      attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
      stride: 12,
    },
    subsets: [{ indexCount: 3, indexOffset: 0 }],
    vertices: new Float32Array([-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1]),
  });
}

// Builds a perspective projection matrix for a 90-degree FOV camera at the origin looking down
// -Z. Returns the MVP matrix that produces a frustum from z=0.1 to z=100.
function makeViewProjection() {
  const mat = createMatrix4();
  const m = mat.m;
  // Perspective: fovy=90deg, aspect=1, near=0.1, far=100 — simple derivation
  const f = 1.0; // cot(fov/2) for 90deg
  const near = 0.1;
  const far = 100;
  m[0] = f;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  m[15] = 0;
  return mat;
}

describe('buildSceneFrustum', () => {
  it('writes frustum planes from a view-projection matrix', () => {
    const frustum = createFrustum();
    const vp = makeViewProjection();
    buildSceneFrustum(frustum, vp);
    // All 6 named planes should have non-zero normals after extraction.
    const planes = [frustum.near, frustum.far, frustum.left, frustum.right, frustum.top, frustum.bottom];
    for (const p of planes) {
      const len = Math.sqrt(p.a * p.a + p.b * p.b + p.c * p.c);
      expect(len).toBeGreaterThan(0);
    }
  });
});

describe('cullSceneNodeByFrustum', () => {
  it('returns empty when no meshes', () => {
    const root = createScene();
    const frustum = createFrustum();
    buildSceneFrustum(frustum, makeViewProjection());
    const out = cullSceneNodeByFrustum([], root, frustum);
    expect(out).toHaveLength(0);
  });

  it('collects a mesh at the origin that is in frustum', () => {
    const root = createScene();
    const mesh = createMesh(makeBoxGeometry(), []);
    setVector3(mesh.position, 0, 0, -5); // in front of camera
    invalidateNodeLocalTransform(mesh);
    addNodeChild(root, mesh);
    const frustum = createFrustum();
    buildSceneFrustum(frustum, makeViewProjection());
    const out = cullSceneNodeByFrustum([], root, frustum);
    expect(out).toContain(mesh);
  });

  it('excludes disabled nodes and their subtrees', () => {
    const root = createScene();
    const parent = createSceneNode();
    parent.enabled = false;
    const mesh = createMesh(makeBoxGeometry(), []);
    setVector3(mesh.position, 0, 0, -5);
    invalidateNodeLocalTransform(mesh);
    addNodeChild(parent, mesh);
    addNodeChild(root, parent);
    const frustum = createFrustum();
    buildSceneFrustum(frustum, makeViewProjection());
    const out = cullSceneNodeByFrustum([], root, frustum);
    expect(out).not.toContain(mesh);
    expect(out).not.toContain(parent);
  });

  it('excludes meshes behind the camera', () => {
    const root = createScene();
    const mesh = createMesh(makeBoxGeometry(), []);
    setVector3(mesh.position, 0, 0, 50); // behind camera (positive Z in RH)
    invalidateNodeLocalTransform(mesh);
    addNodeChild(root, mesh);
    const frustum = createFrustum();
    buildSceneFrustum(frustum, makeViewProjection());
    const out = cullSceneNodeByFrustum([], root, frustum);
    expect(out).not.toContain(mesh);
  });

  it('does not clear out before appending', () => {
    const root = createScene();
    const mesh = createMesh(makeBoxGeometry(), []);
    setVector3(mesh.position, 0, 0, -5);
    invalidateNodeLocalTransform(mesh);
    addNodeChild(root, mesh);
    const frustum = createFrustum();
    buildSceneFrustum(frustum, makeViewProjection());
    const existing = [createSceneNode()];
    cullSceneNodeByFrustum(existing, root, frustum);
    expect(existing).toHaveLength(2); // original + new mesh
  });

  it('returns the out array', () => {
    const root = createScene();
    const frustum = createFrustum();
    buildSceneFrustum(frustum, makeViewProjection());
    const out: ReturnType<typeof createSceneNode>[] = [];
    expect(cullSceneNodeByFrustum(out, root, frustum)).toBe(out);
  });
});
