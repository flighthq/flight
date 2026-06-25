import { createVector3 } from '@flighthq/geometry';
import type { Vector3Like } from '@flighthq/types';

import { createCamera, setCameraViewMatrix4FromLookAt } from './camera';
import { getCameraFrustumCorners } from './frustumCorners';
import { createPerspectiveProjection } from './projection';

type FrustumCorners = [
  Vector3Like,
  Vector3Like,
  Vector3Like,
  Vector3Like,
  Vector3Like,
  Vector3Like,
  Vector3Like,
  Vector3Like,
];

function makeCamera() {
  const camera = createCamera({
    far: 100,
    near: 1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 2 }),
  });
  setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 10), createVector3(0, 0, 0), createVector3(0, 1, 0));
  return camera;
}

function makeCorners(): FrustumCorners {
  return [
    createVector3(),
    createVector3(),
    createVector3(),
    createVector3(),
    createVector3(),
    createVector3(),
    createVector3(),
    createVector3(),
  ];
}

describe('getCameraFrustumCorners', () => {
  it('writes 8 world-space corners and returns true', () => {
    const camera = makeCamera();
    const corners = makeCorners();
    const result = getCameraFrustumCorners(corners, camera, 1);
    expect(result).toBe(true);
    // Near corners (index 0-3) should be closer to camera than far corners (4-7).
    // Camera is at z=10 looking toward z=0, so smaller z values are farther away.
    for (let i = 0; i < 4; i++) {
      expect(corners[i].z).toBeGreaterThan(corners[i + 4].z);
    }
  });

  it('returns false when the view-projection is non-invertible', () => {
    const camera = makeCamera();
    camera.near = 1;
    camera.far = 1; // Degenerate: near == far.
    const corners = makeCorners();
    const result = getCameraFrustumCorners(corners, camera, 1);
    expect(result).toBe(false);
  });

  it('near corners and far corners have opposite symmetry in xy', () => {
    const camera = makeCamera();
    const corners = makeCorners();
    getCameraFrustumCorners(corners, camera, 1);
    // Near corners: 0 (-1,-1,-1), 1 (1,-1,-1), 2 (-1,1,-1), 3 (1,1,-1)
    // With aspect=1 and fovY=PI/2, the near plane half-extent = near * tan(PI/4) = near.
    // Near = 1 → half-extent = 1. Near corner 0 should be (-1,-1, near_z) and corner 3 (1,1, near_z).
    expect(corners[0].x).toBeCloseTo(-corners[1].x, 3);
    expect(corners[0].y).toBeCloseTo(-corners[2].y, 3);
    expect(corners[3].x).toBeCloseTo(-corners[2].x, 3);
  });
});
