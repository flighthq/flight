import { createAabb, createBoundingSphere, createFrustum, createVector3 } from '@flighthq/geometry';

import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from './camera';
import {
  getCamera3DFrustum,
  isBoxInCamera3DFrustum,
  isPointInCamera3DFrustum,
  isSphereInCamera3DFrustum,
} from './culling';
import { createPerspectiveProjection } from './projection';

function makeCamera() {
  const camera = createCamera3D({
    far: 100,
    near: 1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 2 }),
  });
  setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 10), createVector3(0, 0, 0), createVector3(0, 1, 0));
  return camera;
}

describe('getCamera3DFrustum', () => {
  it('writes the six frustum planes into the out frustum', () => {
    const camera = makeCamera();
    const frustum = createFrustum();
    getCamera3DFrustum(frustum, camera, 1);
    // Near plane normal should have a z component (pointing generally toward the camera).
    const len = Math.sqrt(
      frustum.near.a * frustum.near.a + frustum.near.b * frustum.near.b + frustum.near.c * frustum.near.c,
    );
    expect(len).toBeCloseTo(1, 3);
  });
});

describe('isBoxInCamera3DFrustum', () => {
  it('returns true for a box in front of the camera', () => {
    const camera = makeCamera();
    const aabb = createAabb();
    aabb.min.x = -1;
    aabb.min.y = -1;
    aabb.min.z = 2;
    aabb.max.x = 1;
    aabb.max.y = 1;
    aabb.max.z = 5;
    expect(isBoxInCamera3DFrustum(camera, aabb, 1)).toBe(true);
  });

  it('returns false for a box entirely behind the camera', () => {
    const camera = makeCamera();
    const aabb = createAabb();
    // Behind eye at z=10, so z > 10 is behind.
    aabb.min.x = -1;
    aabb.min.y = -1;
    aabb.min.z = 15;
    aabb.max.x = 1;
    aabb.max.y = 1;
    aabb.max.z = 20;
    expect(isBoxInCamera3DFrustum(camera, aabb, 1)).toBe(false);
  });
});

describe('isPointInCamera3DFrustum', () => {
  it('returns true for a point in the frustum', () => {
    const camera = makeCamera();
    const point = createVector3(0, 0, 5);
    expect(isPointInCamera3DFrustum(camera, point, 1)).toBe(true);
  });

  it('returns false for a point behind the camera', () => {
    const camera = makeCamera();
    const point = createVector3(0, 0, 15);
    expect(isPointInCamera3DFrustum(camera, point, 1)).toBe(false);
  });
});

describe('isSphereInCamera3DFrustum', () => {
  it('returns true for a sphere in front of the camera', () => {
    const camera = makeCamera();
    const sphere = createBoundingSphere(0, 0, 5, 1);
    expect(isSphereInCamera3DFrustum(camera, sphere, 1)).toBe(true);
  });

  it('returns false for a sphere entirely behind the camera', () => {
    const camera = makeCamera();
    // A small sphere far behind the eye.
    const sphere = createBoundingSphere(0, 0, 20, 1);
    expect(isSphereInCamera3DFrustum(camera, sphere, 1)).toBe(false);
  });

  it('returns false for an empty sphere', () => {
    const camera = makeCamera();
    const sphere = createBoundingSphere(0, 0, 5, -1);
    expect(isSphereInCamera3DFrustum(camera, sphere, 1)).toBe(false);
  });
});
