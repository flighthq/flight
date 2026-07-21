import { createBoundingSphere, createPlane, createRay3D, createVector3 } from '@flighthq/geometry';

import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from './camera';
import { getCamera3DRayThroughBoundingSphere, intersectCamera3DRayWithPlane } from './intersection';
import { createPerspectiveProjection } from './projection';

function makeCamera() {
  const camera = createCamera3D({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 2 }),
  });
  setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 10), createVector3(0, 0, 0), createVector3(0, 1, 0));
  return camera;
}

describe('getCamera3DRayThroughBoundingSphere', () => {
  it('returns true for a sphere in front of the camera', () => {
    const camera = makeCamera();
    const sphere = createBoundingSphere(0, 0, 5, 1);
    const ray = createRay3D();
    const result = getCamera3DRayThroughBoundingSphere(ray, camera, sphere, 1);
    expect(result).toBe(true);
  });

  it('returns a ray pointing from the camera toward the sphere center', () => {
    const camera = makeCamera();
    // Sphere centered at origin, camera at (0,0,10) looking toward (0,0,0).
    const sphere = createBoundingSphere(0, 0, 0, 1);
    const ray = createRay3D();
    getCamera3DRayThroughBoundingSphere(ray, camera, sphere, 1);
    // The direction should point toward -Z (from eye at 0,0,10 toward sphere center 0,0,0).
    expect(ray.direction.x).toBeCloseTo(0, 3);
    expect(ray.direction.y).toBeCloseTo(0, 3);
    expect(ray.direction.z).toBeCloseTo(-1, 3);
  });

  it('returns false for an empty sphere (negative radius)', () => {
    const camera = makeCamera();
    const sphere = createBoundingSphere(0, 0, 5, -1);
    const ray = createRay3D();
    expect(getCamera3DRayThroughBoundingSphere(ray, camera, sphere, 1)).toBe(false);
  });

  it('returns false when the sphere center is behind the camera', () => {
    const camera = makeCamera();
    // Camera3D is at z=10 looking toward -Z. A sphere at z=15 is behind the camera.
    const sphere = createBoundingSphere(0, 0, 15, 1);
    const ray = createRay3D();
    expect(getCamera3DRayThroughBoundingSphere(ray, camera, sphere, 1)).toBe(false);
  });

  it('is alias-safe when out shares fields with sphere center', () => {
    const camera = makeCamera();
    const sphere = createBoundingSphere(0, 0, 5, 1);
    // Create a ray whose origin is the same object as sphere.center (aliasing).
    const ray = createRay3D(sphere.center.x, sphere.center.y, sphere.center.z);
    const result = getCamera3DRayThroughBoundingSphere(ray, camera, sphere, 1);
    // Should succeed regardless of aliasing.
    expect(result).toBe(true);
  });
});

describe('intersectCamera3DRayWithPlane', () => {
  it('returns the hit point for a ray pointing straight down into a horizontal plane', () => {
    // Ray pointing straight down (-Y) from (0, 5, 0).
    const ray = createRay3D(0, 5, 0, 0, -1, 0);
    // Horizontal ground plane: y = 0 → 0x + 1y + 0z + 0 = 0.
    const plane = createPlane(0, 1, 0, 0);
    const hit = createVector3();
    const result = intersectCamera3DRayWithPlane(hit, ray, plane);
    expect(result).toBe(true);
    expect(hit.x).toBeCloseTo(0, 5);
    expect(hit.y).toBeCloseTo(0, 5);
    expect(hit.z).toBeCloseTo(0, 5);
  });

  it('returns false when the ray is parallel to the plane', () => {
    // Ray pointing horizontally (along X) and a vertical plane (normal = Y).
    const ray = createRay3D(0, 1, 0, 1, 0, 0);
    const plane = createPlane(0, 1, 0, -1); // y = 1
    const hit = createVector3();
    expect(intersectCamera3DRayWithPlane(hit, ray, plane)).toBe(false);
  });

  it('returns false when the intersection is behind the ray origin (t < 0)', () => {
    // Ray pointing UP (+Y) from below a plane at y=0: the intersection t would be negative.
    const ray = createRay3D(0, -5, 0, 0, 1, 0);
    // Plane at y = -10: 0x + 1y + 0z + 10 = 0.
    const plane = createPlane(0, 1, 0, 10);
    const hit = createVector3();
    // t = -(0*0 + 1*(-5) + 0*0 + 10) / (0*0 + 1*1 + 0*0) = -(5) / 1 = -5 < 0 → false.
    expect(intersectCamera3DRayWithPlane(hit, ray, plane)).toBe(false);
  });

  it('computes the correct hit point for a diagonal ray against a diagonal plane', () => {
    // Ray from (0,0,0) pointing diagonally (+1, +1, 0).
    const ray = createRay3D(0, 0, 0, 1, 1, 0);
    // Plane at x + y = 4: 1x + 1y + 0z - 4 = 0.
    const plane = createPlane(1, 1, 0, -4);
    const hit = createVector3();
    const result = intersectCamera3DRayWithPlane(hit, ray, plane);
    expect(result).toBe(true);
    // t = -(0 + 0 - 4) / (1 + 1) = 4/2 = 2 → hit = (2, 2, 0).
    expect(hit.x).toBeCloseTo(2, 5);
    expect(hit.y).toBeCloseTo(2, 5);
    expect(hit.z).toBeCloseTo(0, 5);
  });

  it('is alias-safe when out is the same object as the ray origin', () => {
    const ray = createRay3D(0, 5, 0, 0, -1, 0);
    const plane = createPlane(0, 1, 0, 0);
    // Alias out = ray.origin.
    const result = intersectCamera3DRayWithPlane(ray.origin, ray, plane);
    expect(result).toBe(true);
    expect(ray.origin.y).toBeCloseTo(0, 5);
  });
});
