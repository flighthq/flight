import { createCamera, createPerspectiveProjection, setCameraViewMatrix4FromLookAt } from '@flighthq/camera';
import { createQuaternion, setQuaternionFromAxisAngle } from '@flighthq/geometry';
import { createPlaneMeshGeometry } from '@flighthq/mesh';
import { addNodeChild, getNodeWorldTransformMatrix4 } from '@flighthq/node';
import type { Camera } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createBillboard } from './billboard';
import { orientBillboardToCamera, orientSceneBillboardsToCamera } from './billboardCamera';
import { createMesh } from './mesh';
import { createSceneNode } from './sceneNode';
import { setSceneNodePosition, setSceneNodeRotationQuaternion, setSceneNodeScale } from './sceneNodeTransform';

// A camera at (ex,ey,ez) looking at the world origin with world +Y up.
function cameraLookingFrom(ex: number, ey: number, ez: number): Camera {
  const camera = createCamera({ far: 100, near: 0.1, projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }) });
  setCameraViewMatrix4FromLookAt(camera, { x: ex, y: ey, z: ez }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return camera;
}

describe('orientBillboardToCamera', () => {
  it('full mode at the origin faces a +Z camera with an identity basis', () => {
    const billboard = createBillboard(createPlaneMeshGeometry(), [null], 'full');
    orientBillboardToCamera(billboard, cameraLookingFrom(0, 0, 10));
    const m = getNodeWorldTransformMatrix4(billboard).m;
    // right = +X, up = +Y, normal(+Z) toward the camera.
    expect(m[0]).toBeCloseTo(1, 5);
    expect(m[5]).toBeCloseTo(1, 5);
    expect(m[10]).toBeCloseTo(1, 5);
    expect(m[1]).toBeCloseTo(0, 5);
    expect(m[4]).toBeCloseTo(0, 5);
    expect(m[8]).toBeCloseTo(0, 5);
  });

  it('full mode points the normal at the camera eye and preserves world position', () => {
    const billboard = createBillboard(createPlaneMeshGeometry(), [null], 'full');
    setSceneNodePosition(billboard, 3, 0, 0);
    orientBillboardToCamera(billboard, cameraLookingFrom(0, 0, 10));
    const m = getNodeWorldTransformMatrix4(billboard).m;
    // Position preserved.
    expect(m[12]).toBeCloseTo(3, 5);
    expect(m[13]).toBeCloseTo(0, 5);
    expect(m[14]).toBeCloseTo(0, 5);
    // Normal = normalize(eye - position) = normalize((-3, 0, 10)).
    const length = Math.hypot(-3, 0, 10);
    expect(m[8]).toBeCloseTo(-3 / length, 5);
    expect(m[9]).toBeCloseTo(0, 5);
    expect(m[10]).toBeCloseTo(10 / length, 5);
  });

  it('full mode preserves world scale in the facing basis', () => {
    const billboard = createBillboard(createPlaneMeshGeometry(), [null], 'full');
    setSceneNodeScale(billboard, 2, 2, 2);
    orientBillboardToCamera(billboard, cameraLookingFrom(0, 0, 10));
    const m = getNodeWorldTransformMatrix4(billboard).m;
    expect(Math.hypot(m[0], m[1], m[2])).toBeCloseTo(2, 5);
    expect(Math.hypot(m[4], m[5], m[6])).toBeCloseTo(2, 5);
    expect(Math.hypot(m[8], m[9], m[10])).toBeCloseTo(2, 5);
  });

  it('axisY mode yaws about world +Y and stays upright', () => {
    const billboard = createBillboard(createPlaneMeshGeometry(), [null], 'axisY');
    orientBillboardToCamera(billboard, cameraLookingFrom(10, 5, 0));
    const m = getNodeWorldTransformMatrix4(billboard).m;
    // Normal projected onto XZ toward the camera = +X; up stays world +Y; right = up x normal = -Z.
    expect(m[8]).toBeCloseTo(1, 5);
    expect(m[9]).toBeCloseTo(0, 5);
    expect(m[10]).toBeCloseTo(0, 5);
    expect(m[4]).toBeCloseTo(0, 5);
    expect(m[5]).toBeCloseTo(1, 5);
    expect(m[6]).toBeCloseTo(0, 5);
    expect(m[0]).toBeCloseTo(0, 5);
    expect(m[2]).toBeCloseTo(-1, 5);
  });

  it('screenAligned mode adopts the camera basis regardless of position', () => {
    const billboard = createBillboard(createPlaneMeshGeometry(), [null], 'screenAligned');
    setSceneNodePosition(billboard, 5, 3, 0);
    orientBillboardToCamera(billboard, cameraLookingFrom(0, 0, 10));
    const m = getNodeWorldTransformMatrix4(billboard).m;
    expect(m[0]).toBeCloseTo(1, 5);
    expect(m[5]).toBeCloseTo(1, 5);
    expect(m[10]).toBeCloseTo(1, 5);
    expect(m[12]).toBeCloseTo(5, 5);
    expect(m[13]).toBeCloseTo(3, 5);
    expect(m[14]).toBeCloseTo(0, 5);
  });

  it('is stable across repeated orientation (no scale or position drift)', () => {
    const billboard = createBillboard(createPlaneMeshGeometry(), [null], 'full');
    setSceneNodePosition(billboard, 3, 0, 0);
    setSceneNodeScale(billboard, 2, 2, 2);
    const camera = cameraLookingFrom(0, 0, 10);
    orientBillboardToCamera(billboard, camera);
    orientBillboardToCamera(billboard, camera);
    orientBillboardToCamera(billboard, camera);
    const m = getNodeWorldTransformMatrix4(billboard).m;
    expect(m[12]).toBeCloseTo(3, 5);
    expect(Math.hypot(m[0], m[1], m[2])).toBeCloseTo(2, 5);
    expect(Math.hypot(m[8], m[9], m[10])).toBeCloseTo(2, 5);
  });
});

describe('orientSceneBillboardsToCamera', () => {
  it('orients billboards in a subtree and leaves non-billboards untouched', () => {
    const root = createSceneNode();
    const mesh = createMesh(createPlaneMeshGeometry(), [null]);
    setSceneNodePosition(mesh, 7, 0, 0);
    const billboard = createBillboard(createPlaneMeshGeometry(), [null], 'full');
    addNodeChild(root, mesh);
    addNodeChild(root, billboard);

    orientSceneBillboardsToCamera(root, cameraLookingFrom(0, 0, 10));

    // Billboard faces the camera.
    const b = getNodeWorldTransformMatrix4(billboard).m;
    expect(b[0]).toBeCloseTo(1, 5);
    expect(b[10]).toBeCloseTo(1, 5);
    // Mesh is untouched: its authored position is intact.
    const meshMatrix = getNodeWorldTransformMatrix4(mesh).m;
    expect(meshMatrix[12]).toBeCloseTo(7, 5);
  });

  it('faces the camera in world space regardless of parent rotation', () => {
    const parent = createSceneNode();
    const rotation = createQuaternion(0, 0, 0, 1);
    setQuaternionFromAxisAngle(rotation, { x: 0, y: 1, z: 0 }, Math.PI / 2);
    setSceneNodeRotationQuaternion(parent, rotation);
    const billboard = createBillboard(createPlaneMeshGeometry(), [null], 'full');
    addNodeChild(parent, billboard);

    orientSceneBillboardsToCamera(parent, cameraLookingFrom(0, 0, 10));

    // Parent is yawed 90°, but the billboard's world basis still faces the camera (identity).
    const m = getNodeWorldTransformMatrix4(billboard).m;
    expect(m[0]).toBeCloseTo(1, 5);
    expect(m[5]).toBeCloseTo(1, 5);
    expect(m[10]).toBeCloseTo(1, 5);
    expect(m[2]).toBeCloseTo(0, 5);
    expect(m[8]).toBeCloseTo(0, 5);
  });
});
