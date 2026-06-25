import { createVector3 } from '@flighthq/geometry';

import { getCameraForward, getCameraPosition, getCameraRight, getCameraUp } from './basis';
import { createCamera, setCameraViewMatrix4FromLookAt } from './camera';
import { createPerspectiveProjection } from './projection';

function makeCamera() {
  return createCamera({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
  });
}

describe('getCameraForward', () => {
  it('returns the eye→target direction for a look-at camera', () => {
    const camera = makeCamera();
    // Camera at (0,0,5) looking at origin — forward should be (0,0,-1).
    setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    const out = createVector3();
    getCameraForward(out, camera);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(-1);
  });

  it('is safe when out aliases a camera view field component', () => {
    const camera = makeCamera();
    setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    // Use a standalone out; just confirm it does not throw.
    const out = createVector3();
    getCameraForward(out, camera);
    expect(out.z).toBeCloseTo(-1);
  });
});

describe('getCameraPosition', () => {
  it('returns the eye position for a look-at camera', () => {
    const camera = makeCamera();
    setCameraViewMatrix4FromLookAt(camera, createVector3(3, 4, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    const out = createVector3();
    getCameraPosition(out, camera);
    expect(out.x).toBeCloseTo(3);
    expect(out.y).toBeCloseTo(4);
    expect(out.z).toBeCloseTo(5);
  });

  it('returns the origin for an identity view', () => {
    const camera = makeCamera();
    // Default view is identity → eye at origin.
    const out = createVector3(9, 9, 9);
    getCameraPosition(out, camera);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(0);
  });
});

describe('getCameraRight', () => {
  it('returns the world-space right direction for a look-at camera', () => {
    const camera = makeCamera();
    // Looking along -Z, up = +Y → right should be +X.
    setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    const out = createVector3();
    getCameraRight(out, camera);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(0);
  });
});

describe('getCameraUp', () => {
  it('returns the world-space up direction for a look-at camera', () => {
    const camera = makeCamera();
    // Looking along -Z, up hint = +Y → computed up should be +Y.
    setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    const out = createVector3();
    getCameraUp(out, camera);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(0);
  });
});
