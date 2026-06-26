import { createAabb } from '@flighthq/geometry';
import type { OrthographicProjection } from '@flighthq/types';

import { createCamera } from './camera';
import { createPerspectiveProjection } from './projection';
import { setupDirectionalShadowCamera } from './shadowCamera';

function bounds() {
  return createAabb(-1, -1, -1, 1, 1, 1);
}

describe('setupDirectionalShadowCamera', () => {
  it('switches the camera to an orthographic frustum sized to the scene sphere', () => {
    const camera = createCamera({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });

    setupDirectionalShadowCamera(camera, { x: 0, y: -1, z: 0 }, bounds());

    expect(camera.projection.kind).toBe('orthographic');
    const radius = Math.hypot(1, 1, 1);
    expect((camera.projection as OrthographicProjection).halfWidth).toBeCloseTo(radius);
    expect(camera.near).toBeCloseTo(radius);
    expect(camera.far).toBeCloseTo(radius * 3);
  });

  it('places the scene centre two radii in front along the light direction', () => {
    const camera = createCamera({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });

    setupDirectionalShadowCamera(camera, { x: 0, y: -1, z: 0 }, bounds());

    // The world origin (= scene centre) maps to (0, 0, -distance) in the shadow camera's view space;
    // the view matrix's translation column carries that view-space position of the world origin.
    const distance = Math.hypot(1, 1, 1) * 2;
    expect(camera.view.m[12]).toBeCloseTo(0);
    expect(camera.view.m[13]).toBeCloseTo(0);
    expect(camera.view.m[14]).toBeCloseTo(-distance);
  });
});
