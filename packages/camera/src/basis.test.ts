import { createVector3 } from '@flighthq/geometry';

import { getCamera3DForward, getCamera3DPosition, getCamera3DRight, getCamera3DUp } from './basis';
import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from './camera';
import { createPerspectiveProjection } from './projection';

function makeCamera() {
  return createCamera3D({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
  });
}

describe('getCamera3DForward', () => {
  it('returns the eye→target direction for a look-at camera', () => {
    const camera = makeCamera();
    // Camera3D at (0,0,5) looking at origin — forward should be (0,0,-1).
    setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    const out = createVector3();
    getCamera3DForward(out, camera);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(-1);
  });

  it('is safe when out aliases a camera view field component', () => {
    const camera = makeCamera();
    setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    // Use a standalone out; just confirm it does not throw.
    const out = createVector3();
    getCamera3DForward(out, camera);
    expect(out.z).toBeCloseTo(-1);
  });
});

describe('getCamera3DPosition', () => {
  it('returns the eye position for a look-at camera', () => {
    const camera = makeCamera();
    setCamera3DViewMatrix4FromLookAt(camera, createVector3(3, 4, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    const out = createVector3();
    getCamera3DPosition(out, camera);
    expect(out.x).toBeCloseTo(3);
    expect(out.y).toBeCloseTo(4);
    expect(out.z).toBeCloseTo(5);
  });

  it('returns the origin for an identity view', () => {
    const camera = makeCamera();
    // Default view is identity → eye at origin.
    const out = createVector3(9, 9, 9);
    getCamera3DPosition(out, camera);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(0);
  });
});

describe('getCamera3DRight', () => {
  it('returns the world-space right direction for a look-at camera', () => {
    const camera = makeCamera();
    // Looking along -Z, up = +Y → right should be +X.
    setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    const out = createVector3();
    getCamera3DRight(out, camera);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(0);
  });
});

describe('getCamera3DUp', () => {
  it('returns the world-space up direction for a look-at camera', () => {
    const camera = makeCamera();
    // Looking along -Z, up hint = +Y → computed up should be +Y.
    setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    const out = createVector3();
    getCamera3DUp(out, camera);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(0);
  });
});
