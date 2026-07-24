import { createAabb } from '@flighthq/geometry';
import type { OrthographicProjection } from '@flighthq/types';

import { createCamera3D } from './camera';
import { createPerspectiveProjection } from './projection';
import { configureDirectionalShadowCamera3D, configureDirectionalShadowCamera3DTightFit } from './shadowCamera';

function bounds() {
  return createAabb(-1, -1, -1, 1, 1, 1);
}

describe('configureDirectionalShadowCamera3D', () => {
  it('switches the camera to an orthographic frustum sized to the scene sphere', () => {
    const camera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });

    configureDirectionalShadowCamera3D(camera, { x: 0, y: -1, z: 0 }, bounds());

    expect(camera.projection.kind).toBe('orthographic');
    const radius = Math.hypot(1, 1, 1);
    expect((camera.projection as OrthographicProjection).halfWidth).toBeCloseTo(radius);
    expect(camera.near).toBeCloseTo(radius);
    expect(camera.far).toBeCloseTo(radius * 3);
  });

  it('places the scene centre two radii in front along the light direction', () => {
    const camera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });

    configureDirectionalShadowCamera3D(camera, { x: 0, y: -1, z: 0 }, bounds());

    // The world origin (= scene centre) maps to (0, 0, -distance) in the shadow camera's view space;
    // the view matrix's translation column carries that view-space position of the world origin.
    const distance = Math.hypot(1, 1, 1) * 2;
    expect(camera.view.m[12]).toBeCloseTo(0);
    expect(camera.view.m[13]).toBeCloseTo(0);
    expect(camera.view.m[14]).toBeCloseTo(-distance);
  });
});

describe('configureDirectionalShadowCamera3DTightFit', () => {
  it('fits light-space orthographic extents more tightly than the rotation-stable sphere fit', () => {
    const sphereCamera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });
    const tightCamera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });
    const sceneBounds = createAabb(-10, -1, -2, 10, 1, 2);
    configureDirectionalShadowCamera3D(sphereCamera, { x: 0, y: -1, z: 0 }, sceneBounds);
    configureDirectionalShadowCamera3DTightFit(tightCamera, { x: 0, y: -1, z: 0 }, sceneBounds);

    const sphere = sphereCamera.projection as OrthographicProjection;
    const tight = tightCamera.projection as OrthographicProjection;
    expect(tight.halfWidth).toBeCloseTo(10);
    expect(tight.halfHeight).toBeCloseTo(2);
    expect(tight.halfWidth).toBeLessThan(sphere.halfWidth);
    expect(tight.halfHeight).toBeLessThan(sphere.halfHeight);
  });

  it('multiplies fitted extents by padding', () => {
    const camera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });
    configureDirectionalShadowCamera3DTightFit(camera, { x: 0, y: -1, z: 0 }, bounds(), 1.5);
    const projection = camera.projection as OrthographicProjection;
    expect(projection.halfWidth).toBeCloseTo(1.5);
    expect(projection.halfHeight).toBeCloseTo(1.5);
    expect(camera.near).toBeGreaterThan(0);
    expect(camera.far).toBeGreaterThan(camera.near);
  });

  it('falls back to a valid unit fit for empty bounds and a zero direction', () => {
    const camera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });
    configureDirectionalShadowCamera3DTightFit(camera, { x: 0, y: 0, z: 0 }, createAabb());
    const projection = camera.projection as OrthographicProjection;
    expect(projection.halfWidth).toBeGreaterThan(0);
    expect(projection.halfHeight).toBeGreaterThan(0);
    expect(camera.near).toBeGreaterThan(0);
    expect(camera.far).toBeGreaterThan(camera.near);
  });
});
