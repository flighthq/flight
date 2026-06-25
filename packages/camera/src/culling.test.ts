import { createAabb, createBoundingSphere, createFrustum, createVector3 } from '@flighthq/geometry';

import { createCamera, setCameraViewMatrix4FromLookAt } from './camera';
import { getCameraFrustum, isBoxInCameraFrustum, isPointInCameraFrustum, isSphereInCameraFrustum } from './culling';
import { createPerspectiveProjection } from './projection';

function makeCamera() {
  const camera = createCamera({
    far: 100,
    near: 1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 2 }),
  });
  setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 10), createVector3(0, 0, 0), createVector3(0, 1, 0));
  return camera;
}

describe('getCameraFrustum', () => {
  it('writes the six frustum planes into the out frustum', () => {
    const camera = makeCamera();
    const frustum = createFrustum();
    getCameraFrustum(frustum, camera, 1);
    // Near plane normal should have a z component (pointing generally toward the camera).
    const len = Math.sqrt(
      frustum.near.a * frustum.near.a + frustum.near.b * frustum.near.b + frustum.near.c * frustum.near.c,
    );
    expect(len).toBeCloseTo(1, 3);
  });
});

describe('isBoxInCameraFrustum', () => {
  it('returns true for a box in front of the camera', () => {
    const camera = makeCamera();
    const aabb = createAabb();
    aabb.min.x = -1;
    aabb.min.y = -1;
    aabb.min.z = 2;
    aabb.max.x = 1;
    aabb.max.y = 1;
    aabb.max.z = 5;
    expect(isBoxInCameraFrustum(camera, aabb, 1)).toBe(true);
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
    expect(isBoxInCameraFrustum(camera, aabb, 1)).toBe(false);
  });
});

describe('isPointInCameraFrustum', () => {
  it('returns true for a point in the frustum', () => {
    const camera = makeCamera();
    const point = createVector3(0, 0, 5);
    expect(isPointInCameraFrustum(camera, point, 1)).toBe(true);
  });

  it('returns false for a point behind the camera', () => {
    const camera = makeCamera();
    const point = createVector3(0, 0, 15);
    expect(isPointInCameraFrustum(camera, point, 1)).toBe(false);
  });
});

describe('isSphereInCameraFrustum', () => {
  it('returns true for a sphere in front of the camera', () => {
    const camera = makeCamera();
    const sphere = createBoundingSphere(0, 0, 5, 1);
    expect(isSphereInCameraFrustum(camera, sphere, 1)).toBe(true);
  });

  it('returns false for a sphere entirely behind the camera', () => {
    const camera = makeCamera();
    // A small sphere far behind the eye.
    const sphere = createBoundingSphere(0, 0, 20, 1);
    expect(isSphereInCameraFrustum(camera, sphere, 1)).toBe(false);
  });

  it('returns false for an empty sphere', () => {
    const camera = makeCamera();
    const sphere = createBoundingSphere(0, 0, 5, -1);
    expect(isSphereInCameraFrustum(camera, sphere, 1)).toBe(false);
  });
});
