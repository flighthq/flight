import { createCamera, createPerspectiveProjection, setCameraViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene, createSceneNode, setSceneNodePosition } from '@flighthq/scene';
import type { Camera, Mesh, SceneHit } from '@flighthq/types';

import { pickScene } from './pickScene';

function makeCamera(): Camera {
  const camera = createCamera({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 2 }),
  });
  // Look down -Z at the origin from z = 5.
  setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
  return camera;
}

function makeHit(): SceneHit {
  return { distance: 0, node: null as unknown as Mesh, pointX: 0, pointY: 0, pointZ: 0, u: 0, v: 0, w: 0 };
}

function sceneWithCenteredBox(): { scene: Scene; mesh: Mesh } {
  const scene = createScene();
  const mesh = createMesh(createBoxMeshGeometry(2, 2, 2), []);
  addNodeChild(scene, mesh);
  return { scene, mesh };
}

describe('pickScene', () => {
  it('fills barycentric weights that sum to one', () => {
    const camera = makeCamera();
    const { scene } = sceneWithCenteredBox();
    const out = makeHit();

    const hit = pickScene(scene, camera, 0, 0, out);

    expect(hit).not.toBeNull();
    expect((hit?.u ?? 0) + (hit?.v ?? 0) + (hit?.w ?? 0)).toBeCloseTo(1, 5);
  });

  it('returns null for a scene containing only non-mesh nodes', () => {
    const camera = makeCamera();
    const scene = createScene();
    // A plain SceneNode is not a Mesh; isMesh() returns false for it.
    const node = createSceneNode();
    addNodeChild(scene, node);
    const out = makeHit();

    expect(pickScene(scene, camera, 0, 0, out)).toBeNull();
  });

  it('returns null when the ray misses every mesh', () => {
    const camera = makeCamera();
    const { scene } = sceneWithCenteredBox();
    const out = makeHit();

    // Far corner of the viewport points away from the small centred box.
    expect(pickScene(scene, camera, 0.99, 0.99, out)).toBeNull();
  });

  it('returns null when the scene has no meshes', () => {
    const camera = makeCamera();
    const scene = createScene();
    const out = makeHit();

    expect(pickScene(scene, camera, 0, 0, out)).toBeNull();
  });

  it('returns the mesh hit by the center ray', () => {
    const camera = makeCamera();
    const { scene, mesh } = sceneWithCenteredBox();
    const out = makeHit();

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
    // Camera is at z = 5 looking toward the origin in the -Z direction.
    const camera = makeCamera();
    const scene = createScene();

    // meshFar is centred at the origin: front face at z = 1, back face at z = -1.
    const meshFar = createMesh(createBoxMeshGeometry(2, 2, 2), []);
    addNodeChild(scene, meshFar);

    // meshNear is shifted to z = 2: front face at z = 3, back face at z = 1.
    // The camera ray hits its front face first (distance ≈ 2 vs ≈ 4 for meshFar).
    const meshNear = createMesh(createBoxMeshGeometry(2, 2, 2), []);
    setSceneNodePosition(meshNear, 0, 0, 2);
    addNodeChild(scene, meshNear);

    const out = makeHit();
    const hit = pickScene(scene, camera, 0, 0, out);

    expect(hit).toBe(out);
    expect(hit?.node).toBe(meshNear);
    // Front face of meshNear is at z = 3.
    expect(hit?.pointZ).toBeCloseTo(3, 3);
    expect(hit?.distance).toBeGreaterThan(0);
    expect(hit?.distance).toBeLessThan(3); // meshFar's front face would be at distance ≈ 4
  });
});
