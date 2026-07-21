import { createRay3D, createVector3 } from '@flighthq/geometry';

import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from './camera';
import { getCamera3DScreenToWorldRay, getCamera3DWorldToScreen } from './picking';
import { createPerspectiveProjection } from './projection';

function makeCamera() {
  return createCamera3D({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 2 }),
  });
}

describe('getCamera3DScreenToWorldRay', () => {
  it('returns a ray pointing from near toward far for center NDC (0,0)', () => {
    const camera = makeCamera();
    setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    const ray = createRay3D();
    const result = getCamera3DScreenToWorldRay(ray, camera, 0, 0, 1);
    expect(result).toBe(true);
    // Center ray should point along -Z (camera looks toward -Z).
    expect(ray.direction.x).toBeCloseTo(0, 3);
    expect(ray.direction.y).toBeCloseTo(0, 3);
    expect(ray.direction.z).toBeCloseTo(-1, 3);
  });

  it('returns false when the view-projection is non-invertible', () => {
    const camera = makeCamera();
    // near == far collapses the depth range, making the matrix singular.
    camera.near = 1;
    camera.far = 1;
    const ray = createRay3D();
    const result = getCamera3DScreenToWorldRay(ray, camera, 0, 0, 1);
    expect(result).toBe(false);
  });

  it('round-trips with getCamera3DWorldToScreen at the center point', () => {
    const camera = makeCamera();
    setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    // A world point directly ahead of the camera.
    const worldPoint = createVector3(0, 0, 2);
    const ndc = createVector3();
    getCamera3DWorldToScreen(ndc, camera, worldPoint, 1);
    // Unproject those NDC coordinates back.
    const ray = createRay3D();
    getCamera3DScreenToWorldRay(ray, camera, ndc.x, ndc.y, 1);
    // The direction of the ray should point from the origin toward (0,0,2).
    // Since the camera is at (0,0,5) looking at origin, forward is -Z.
    expect(ray.direction.x).toBeCloseTo(0, 2);
    expect(ray.direction.y).toBeCloseTo(0, 2);
    expect(ray.direction.z).toBeCloseTo(-1, 2);
  });
});

describe('getCamera3DWorldToScreen', () => {
  it('maps a point in front of the camera to NDC with |x|, |y| <= 1', () => {
    const camera = makeCamera();
    setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    const ndc = createVector3();
    const result = getCamera3DWorldToScreen(ndc, camera, createVector3(0, 0, 2), 1);
    expect(result).toBe(true);
    expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
  });

  it('maps the origin to (0,0) NDC for a camera looking along -Z', () => {
    const camera = makeCamera();
    setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    const ndc = createVector3();
    getCamera3DWorldToScreen(ndc, camera, createVector3(0, 0, 0), 1);
    expect(ndc.x).toBeCloseTo(0, 3);
    expect(ndc.y).toBeCloseTo(0, 3);
  });

  it('returns false for a point behind the camera', () => {
    const camera = makeCamera();
    setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    const ndc = createVector3();
    // A point behind the eye (z=10, camera eye is at z=5, looking toward z=0).
    const result = getCamera3DWorldToScreen(ndc, camera, createVector3(0, 0, 10), 1);
    expect(result).toBe(false);
  });

  it('is safe when out aliases worldPoint', () => {
    const camera = makeCamera();
    setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    const point = createVector3(0, 0, 2);
    const result = getCamera3DWorldToScreen(point, camera, point, 1);
    // Should succeed and write valid NDC into point (which was also worldPoint).
    expect(result).toBe(true);
    expect(Math.abs(point.x)).toBeLessThanOrEqual(1);
  });
});
