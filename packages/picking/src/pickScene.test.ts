import {
  createCamera3D,
  createOrthographicProjection,
  createPerspectiveProjection,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/camera';
import {
  copyQuaternion,
  createAabb,
  createQuaternion,
  createRay3D,
  createVector3,
  setQuaternionFromAxisAngle,
  setRay3D,
  setVector3,
} from '@flighthq/geometry';
import { createBoxMeshGeometry, createMeshGeometryFromAttributes } from '@flighthq/mesh';
import { ensureMeshGeometryBounds, updateMeshMorph } from '@flighthq/mesh';
import { addNodeChild, getNodeRuntime, invalidateNodeLocalTransform } from '@flighthq/node';
import { createMesh, createSceneNode, SceneNodeKind } from '@flighthq/scene';
import type { Camera3D, Mesh, MeshMorph, MeshRuntime, Ray3D, SceneHit, SceneNode } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { createSceneHit, pickScene, pickSceneAll, pickSceneAllWithRay3D, pickSceneWithRay3D } from './pickScene';

function makeCamera(): Camera3D {
  const camera = createCamera3D({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 2 }),
  });
  // Look down -Z at the origin from z = 5.
  setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
  return camera;
}

// Orthographic camera with a deliberately non-square view volume (halfWidth != halfHeight) to guard
// against a horizontal/vertical mismap. Looks down -Z from z = 5.
function makeOrthoCamera(halfWidth: number, halfHeight: number): Camera3D {
  const camera = createCamera3D({
    far: 100,
    near: 0.1,
    projection: createOrthographicProjection({ halfHeight, halfWidth }),
  });
  setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
  return camera;
}

// A world-space ray from z = 5 pointing toward the origin along -Z (mirrors makeCamera's center ray).
function makeCenterRay(): Ray3D {
  const ray = createRay3D();
  setRay3D(ray, createVector3(0, 0, 5), createVector3(0, 0, -1));
  return ray;
}

// A single triangle in the z = 0 plane. `frontFacing` winds it so its geometric normal points toward
// +Z (toward a camera at +Z); otherwise it faces -Z (away).
function triangleMesh(frontFacing: boolean): Mesh {
  const a = [-1, -1, 0];
  const b = frontFacing ? [1, -1, 0] : [0, 1, 0];
  const c = frontFacing ? [0, 1, 0] : [1, -1, 0];
  const geometry = createMeshGeometryFromAttributes({ positions: [...a, ...b, ...c] });
  return createMesh(geometry, []);
}

function sceneWithCenteredBox(): { scene: SceneNode; mesh: Mesh } {
  const scene = createSceneNode(SceneNodeKind);
  const mesh = createMesh(createBoxMeshGeometry(2, 2, 2), []);
  addNodeChild(scene, mesh);
  return { scene, mesh };
}

describe('createSceneHit', () => {
  it('allocates a zeroed hit with a sentinel triangle index', () => {
    const hit = createSceneHit();

    expect(EntityRuntimeKey in hit).toBe(true);
    expect(hit.triangleIndex).toBe(-1);
    expect(hit.distance).toBe(0);
    expect(hit.normalX).toBe(0);
    expect(hit.normalY).toBe(0);
    expect(hit.normalZ).toBe(0);
  });
});

describe('pickScene', () => {
  it('fills barycentric weights that sum to one', () => {
    const camera = makeCamera();
    const { scene } = sceneWithCenteredBox();
    const out = createSceneHit();

    const hit = pickScene(scene, camera, 0, 0, out);

    expect(hit).not.toBeNull();
    expect((hit?.u ?? 0) + (hit?.v ?? 0) + (hit?.w ?? 0)).toBeCloseTo(1, 5);
  });

  it('fills the world face normal and triangle index of the hit', () => {
    const camera = makeCamera();
    const { scene } = sceneWithCenteredBox();
    const out = createSceneHit();

    const hit = pickScene(scene, camera, 0, 0, out);

    // Front face of the box points at +Z (toward the camera at z = 5).
    expect(hit?.normalZ).toBeCloseTo(1, 5);
    expect(hit?.normalX).toBeCloseTo(0, 5);
    expect(hit?.normalY).toBeCloseTo(0, 5);
    expect(hit?.triangleIndex).toBeGreaterThanOrEqual(0);
  });

  it('returns null for a scene containing only non-mesh nodes', () => {
    const camera = makeCamera();
    const scene = createSceneNode(SceneNodeKind);
    // A plain SceneNode is not a Mesh; isMesh() returns false for it.
    const node = createSceneNode();
    addNodeChild(scene, node);
    const out = createSceneHit();

    expect(pickScene(scene, camera, 0, 0, out)).toBeNull();
  });

  it('returns null when the ray misses every mesh', () => {
    const camera = makeCamera();
    const { scene } = sceneWithCenteredBox();
    const out = createSceneHit();

    // Far corner of the viewport points away from the small centred box.
    expect(pickScene(scene, camera, 0.99, 0.99, out)).toBeNull();
  });

  it('returns null when the scene has no meshes', () => {
    const camera = makeCamera();
    const scene = createSceneNode(SceneNodeKind);
    const out = createSceneHit();

    expect(pickScene(scene, camera, 0, 0, out)).toBeNull();
  });

  it('returns the mesh hit by the center ray', () => {
    const camera = makeCamera();
    const { scene, mesh } = sceneWithCenteredBox();
    const out = createSceneHit();

    const hit = pickScene(scene, camera, 0, 0, out);

    expect(hit).toBe(out);
    expect(hit?.node).toBe(mesh);
    // Front face of a 2x2x2 box centred at the origin is at z = 1; the ray travels -Z from z ~= 5.
    expect(hit?.pointZ).toBeCloseTo(1, 3);
    expect(hit?.pointX).toBeCloseTo(0, 3);
    expect(hit?.pointY).toBeCloseTo(0, 3);
    expect(hit?.distance).toBeGreaterThan(0);
  });

  it('returns the nearer of two overlapping meshes', () => {
    // Camera3D is at z = 5 looking toward the origin in the -Z direction.
    const camera = makeCamera();
    const scene = createSceneNode(SceneNodeKind);

    // meshFar is centred at the origin: front face at z = 1, back face at z = -1.
    const meshFar = createMesh(createBoxMeshGeometry(2, 2, 2), []);
    addNodeChild(scene, meshFar);

    // meshNear is shifted to z = 2: front face at z = 3, back face at z = 1.
    // The camera ray hits its front face first (distance ≈ 2 vs ≈ 4 for meshFar).
    const meshNear = createMesh(createBoxMeshGeometry(2, 2, 2), []);
    setVector3(meshNear.position, 0, 0, 2);
    invalidateNodeLocalTransform(meshNear);
    addNodeChild(scene, meshNear);

    const out = createSceneHit();
    const hit = pickScene(scene, camera, 0, 0, out);

    expect(hit).toBe(out);
    expect(hit?.node).toBe(meshNear);
    // Front face of meshNear is at z = 3.
    expect(hit?.pointZ).toBeCloseTo(3, 3);
    expect(hit?.distance).toBeGreaterThan(0);
    expect(hit?.distance).toBeLessThan(3); // meshFar's front face would be at distance ≈ 4
  });

  it('skips a disabled mesh so it is not pickable', () => {
    const camera = makeCamera();
    const { scene, mesh } = sceneWithCenteredBox();
    mesh.enabled = false;
    const out = createSceneHit();

    expect(pickScene(scene, camera, 0, 0, out)).toBeNull();
  });

  it('prunes the subtree of a disabled group node', () => {
    const camera = makeCamera();
    const scene = createSceneNode(SceneNodeKind);
    const group = createSceneNode();
    group.enabled = false;
    const mesh = createMesh(createBoxMeshGeometry(2, 2, 2), []);
    addNodeChild(group, mesh);
    addNodeChild(scene, group);
    const out = createSceneHit();

    expect(pickScene(scene, camera, 0, 0, out)).toBeNull();
  });

  it('excludes a mesh rejected by the predicate option', () => {
    const camera = makeCamera();
    const scene = createSceneNode(SceneNodeKind);
    const meshFar = createMesh(createBoxMeshGeometry(2, 2, 2), []);
    addNodeChild(scene, meshFar);
    const meshNear = createMesh(createBoxMeshGeometry(2, 2, 2), []);
    setVector3(meshNear.position, 0, 0, 2);
    invalidateNodeLocalTransform(meshNear);
    addNodeChild(scene, meshNear);
    const out = createSceneHit();

    const hit = pickScene(scene, camera, 0, 0, out, { predicate: (m) => m === meshFar });

    expect(hit?.node).toBe(meshFar);
  });

  it('rejects hits beyond maxDistance', () => {
    const camera = makeCamera();
    const { scene } = sceneWithCenteredBox();
    const out = createSceneHit();

    // Front face is ~4 world units from the camera at z = 5.
    expect(pickScene(scene, camera, 0, 0, out, { maxDistance: 3 })).toBeNull();
    expect(pickScene(scene, camera, 0, 0, out, { maxDistance: 4.5 })).not.toBeNull();
  });

  it('maps a non-square orthographic viewport without an aspect mismap', () => {
    // View volume is 8 wide (halfWidth 4) but only 2 tall (halfHeight 1).
    const camera = makeOrthoCamera(4, 1);
    const scene = createSceneNode(SceneNodeKind);
    // A 2x2x2 box centred at x = 3 spans x in [2, 4], within the horizontal extent but well outside
    // the vertical one — so a square (aspect = 1) mismap of screenX would miss it.
    const mesh = createMesh(createBoxMeshGeometry(2, 2, 2), []);
    setVector3(mesh.position, 3, 0, 0);
    invalidateNodeLocalTransform(mesh);
    addNodeChild(scene, mesh);
    const out = createSceneHit();

    // screenX = 0.75 → world x = 0.75 * halfWidth(4) = 3.
    const hit = pickScene(scene, camera, 0.75, 0, out);

    expect(hit?.node).toBe(mesh);
    expect(hit?.pointX).toBeCloseTo(3, 3);
    expect(hit?.pointZ).toBeCloseTo(1, 3);
    // A pick past the horizontal extent misses.
    expect(pickScene(scene, camera, 1.1, 0, out)).toBeNull();
  });

  it('hits a rotated and scaled mesh through the local-space path', () => {
    const camera = makeCamera();
    const scene = createSceneNode(SceneNodeKind);
    const mesh = createMesh(createBoxMeshGeometry(2, 2, 2), []);
    // Non-uniform scale (z doubled) plus a rotation about the Z axis. The +Z face stays on-axis, so
    // its world position is z = 1 * 2 = 2 while the surrounding geometry is rotated — exercising the
    // inverse-transform narrow phase.
    setVector3(mesh.scale, 1.5, 1.5, 2);
    invalidateNodeLocalTransform(mesh);
    const q = createQuaternion();
    setQuaternionFromAxisAngle(q, createVector3(0, 0, 1), Math.PI / 4);
    copyQuaternion(mesh.rotation, q);
    invalidateNodeLocalTransform(mesh);
    addNodeChild(scene, mesh);
    const out = createSceneHit();

    const hit = pickScene(scene, camera, 0, 0, out);

    expect(hit?.node).toBe(mesh);
    expect(hit?.pointZ).toBeCloseTo(2, 3);
    expect(hit?.pointX).toBeCloseTo(0, 3);
    expect(hit?.pointY).toBeCloseTo(0, 3);
    expect(hit?.normalZ).toBeCloseTo(1, 3);
  });
});

describe('pickSceneAll', () => {
  it('collects both overlapping meshes sorted by ascending distance', () => {
    const camera = makeCamera();
    const scene = createSceneNode(SceneNodeKind);
    const meshFar = createMesh(createBoxMeshGeometry(2, 2, 2), []);
    addNodeChild(scene, meshFar);
    const meshNear = createMesh(createBoxMeshGeometry(2, 2, 2), []);
    setVector3(meshNear.position, 0, 0, 2);
    invalidateNodeLocalTransform(meshNear);
    addNodeChild(scene, meshNear);
    const outArray: SceneHit[] = [];

    const hits = pickSceneAll(scene, camera, 0, 0, outArray);

    expect(hits).toBe(outArray);
    // Each box contributes a front-face hit (a 2x2x2 box's front quad is two triangles, but the
    // center ray crosses one triangle per box). Nearest first.
    expect(hits.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i].distance).toBeGreaterThanOrEqual(hits[i - 1].distance);
    }
    expect(hits[0].node).toBe(meshNear);
  });

  it('empties the array on a miss', () => {
    const camera = makeCamera();
    const { scene } = sceneWithCenteredBox();
    const outArray: SceneHit[] = [createSceneHit(), createSceneHit()];

    const hits = pickSceneAll(scene, camera, 0.99, 0.99, outArray);

    expect(hits).toBe(outArray);
    expect(hits.length).toBe(0);
  });
});

describe('pickSceneAllWithRay3D', () => {
  it('collects every triangle a world ray crosses, front and back faces', () => {
    const { scene } = sceneWithCenteredBox();
    const ray = makeCenterRay();
    const outArray: SceneHit[] = [];

    const hits = pickSceneAllWithRay3D(scene, ray, outArray);

    // The center ray runs along the shared diagonal of each quad, so it grazes both triangles of the
    // front face (z = 1) and both of the back face (z = -1): four hits, sorted near-to-far.
    expect(hits.length).toBe(4);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i].distance).toBeGreaterThanOrEqual(hits[i - 1].distance);
    }
    expect(hits[0].pointZ).toBeCloseTo(1, 3);
    expect(hits[hits.length - 1].pointZ).toBeCloseTo(-1, 3);
  });

  it('keeps only front faces when cullBackfaces is set', () => {
    const { scene } = sceneWithCenteredBox();
    const ray = makeCenterRay();
    const outArray: SceneHit[] = [];

    const hits = pickSceneAllWithRay3D(scene, ray, outArray, { cullBackfaces: true });

    // Only the two front-face triangles survive; both point at +Z (toward the ray origin).
    expect(hits.length).toBe(2);
    for (const hit of hits) {
      expect(hit.pointZ).toBeCloseTo(1, 3);
      expect(hit.normalZ).toBeCloseTo(1, 3);
    }
  });
});

describe('pickSceneWithRay3D', () => {
  it('resolves the nearest hit for a world-space ray', () => {
    const { scene, mesh } = sceneWithCenteredBox();
    const ray = makeCenterRay();
    const out = createSceneHit();

    const hit = pickSceneWithRay3D(scene, ray, out, {});

    expect(hit).toBe(out);
    expect(hit?.node).toBe(mesh);
    expect(hit?.pointZ).toBeCloseTo(1, 3);
  });

  it('culls a back-facing triangle but keeps a front-facing one', () => {
    const front = createSceneNode(SceneNodeKind);
    addNodeChild(front, triangleMesh(true));
    const back = createSceneNode(SceneNodeKind);
    addNodeChild(back, triangleMesh(false));
    const out = createSceneHit();

    expect(pickSceneWithRay3D(front, makeCenterRay(), out, { cullBackfaces: true })).not.toBeNull();
    expect(pickSceneWithRay3D(back, makeCenterRay(), out, { cullBackfaces: true })).toBeNull();
    // Double-sided (default) hits either winding.
    expect(pickSceneWithRay3D(back, makeCenterRay(), out)).not.toBeNull();
  });

  it('picks the second triangle of an indexed strip with its CCW winding', () => {
    const geometry = createMeshGeometryFromAttributes({
      indices: [0, 1, 2, 3],
      positions: [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0],
    });
    geometry.topology = 'triangle-strip';
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, createMesh(geometry, []));
    const ray = createRay3D();
    setRay3D(ray, createVector3(0.5, 0.5, 1), createVector3(0, 0, -1));

    const hit = pickSceneWithRay3D(scene, ray, createSceneHit(), { cullBackfaces: true });

    expect(hit?.triangleIndex).toBe(1);
    expect(hit?.normalZ).toBeCloseTo(1);
  });

  it('observes morphed vertices and refreshed broad-phase bounds after explicit update', () => {
    const geometry = createMeshGeometryFromAttributes({
      positions: [9, -1, 0, 11, -1, 0, 10, 1, 0],
    });
    const mesh = createMesh(geometry, []);
    const morph: MeshMorph = {
      targets: [
        {
          normalDeltas: null,
          positionDeltas: new Float32Array([-10, 0, 0, -10, 0, 0, -10, 0, 0]),
          tangentDeltas: null,
        },
      ],
      weights: new Float32Array([1]),
    };
    mesh.morph = morph;
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, mesh);
    const ray = makeCenterRay();
    const out = createSceneHit();

    expect(pickSceneWithRay3D(scene, ray, out)).toBeNull();
    updateMeshMorph(mesh);

    // Bounds are a dirty-gated cache; the morph marks them stale and the ensure recomputes them —
    // which is exactly what the pick below does internally through the broad phase.
    const bounds = ensureMeshGeometryBounds(mesh.geometry);
    expect(bounds?.min.x).toBe(-1);
    expect(bounds?.max.x).toBe(1);
    expect(pickSceneWithRay3D(scene, ray, out)?.node).toBe(mesh);
  });

  it('broad-phases against the posed deformedLocalBounds slot when a deform pass wrote one', () => {
    // A triangle at the origin that the center ray hits head-on. Its bind-pose bounds admit the ray,
    // so with no posed slot the pick lands.
    const mesh = triangleMesh(true);
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, mesh);
    const ray = makeCenterRay();
    const out = createSceneHit();

    expect(pickSceneWithRay3D(scene, ray, out)?.node).toBe(mesh);

    // Simulate a deform pass (prepareSceneSkinning) writing a posed local box far off the ray. The
    // broad-phase must read that slot as data and reject the mesh before the triangle test — proving it
    // no longer uses the bind-pose bounds for a posed mesh.
    (getNodeRuntime(mesh) as MeshRuntime).deformedLocalBounds = createAabb(100, 100, 100, 102, 102, 102);
    expect(pickSceneWithRay3D(scene, ray, out)).toBeNull();

    // Clearing the slot falls back to the bind-pose world bounds, and the pick lands again.
    (getNodeRuntime(mesh) as MeshRuntime).deformedLocalBounds = null;
    expect(pickSceneWithRay3D(scene, ray, out)?.node).toBe(mesh);
  });
});
