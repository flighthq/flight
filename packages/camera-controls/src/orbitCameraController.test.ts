import { createCamera3D, createPerspectiveProjection, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { EntityRuntimeKey } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import {
  cloneOrbitCameraController,
  copyOrbitCameraController,
  createOrbitCameraController,
  dollyCameraController,
  orbitCameraController,
  panCameraController,
  panOrbitCameraControllerInViewPlane,
  resetOrbitCameraController,
  snapOrbitCameraController,
  updateOrbitCameraController,
} from './orbitCameraController';

function testCamera() {
  return createCamera3D({ far: 100, near: 0.1, projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }) });
}

describe('cloneOrbitCameraController', () => {
  it('creates an independent Entity with the same value state', () => {
    const source = createOrbitCameraController({ azimuth: 0.2, distance: 4, target: createVector3(1, 2, 3) });
    const clone = cloneOrbitCameraController(source);
    expect(clone).toMatchObject({ azimuth: 0.2, distance: 4 });
    expect(EntityRuntimeKey in clone).toBe(true);
    expect(clone.target).not.toBe(source.target);
    clone.target.x = 10;
    expect(source.target.x).toBe(1);
  });
});

describe('copyOrbitCameraController', () => {
  it('copies value state without sharing target or replacing runtime state', () => {
    const source = createOrbitCameraController({ azimuth: 0.2, distance: 4, target: createVector3(1, 2, 3) });
    const out = createOrbitCameraController();
    const runtime = { binding: null };
    out[EntityRuntimeKey] = runtime;
    copyOrbitCameraController(out, source);

    expect(out).toMatchObject({ azimuth: 0.2, distance: 4 });
    expect(out[EntityRuntimeKey]).toBe(runtime);
    expect(out.target).not.toBe(source.target);
  });
});

describe('createOrbitCameraController', () => {
  it('applies documented defaults with current equal to goal', () => {
    const c = createOrbitCameraController();
    expect(c.distance).toBe(10);
    expect(c.azimuth).toBe(0);
    expect(c.goalDistance).toBe(c.distance);
    expect(c.goalAzimuth).toBe(c.azimuth);
    expect(c.maxPolar).toBeLessThan(Math.PI / 2);
    expect(c.minPolar).toBeGreaterThan(-Math.PI / 2);
  });

  it('seeds from options', () => {
    const c = createOrbitCameraController({ azimuth: 1, polar: 0.5, distance: 4, target: createVector3(1, 2, 3) });
    expect(c.distance).toBe(4);
    expect(c.polar).toBe(0.5);
    expect(c.target.x).toBe(1);
    expect(c.target.z).toBe(3);
  });

  it('produces an Entity', () => {
    expect(EntityRuntimeKey in createOrbitCameraController()).toBe(true);
  });
});

describe('dollyCameraController', () => {
  it('moves the goal distance, clamped to the range', () => {
    const c = createOrbitCameraController({ distance: 5, minDistance: 2, maxDistance: 8 });
    dollyCameraController(c, 2);
    expect(c.goalDistance).toBe(7);
    dollyCameraController(c, 100);
    expect(c.goalDistance).toBe(8);
    dollyCameraController(c, -100);
    expect(c.goalDistance).toBe(2);
  });
});

describe('orbitCameraController', () => {
  it('adds to the goal angles and clamps polar', () => {
    const c = createOrbitCameraController({ minPolar: -1, maxPolar: 1 });
    orbitCameraController(c, 0.5, 2);
    expect(c.goalAzimuth).toBe(0.5);
    expect(c.goalPolar).toBe(1); // clamped
  });
});

describe('panCameraController', () => {
  it('slides the target along right (at azimuth 0) and world up', () => {
    const c = createOrbitCameraController();
    panCameraController(c, 3, 2);
    expect(c.target.x).toBeCloseTo(3); // right = (cos0, 0, -sin0) = (1,0,0)
    expect(c.target.y).toBeCloseTo(2);
    expect(c.target.z).toBeCloseTo(0);
  });
});

describe('panOrbitCameraControllerInViewPlane', () => {
  it('follows screen-up at nonzero polar', () => {
    const c = createOrbitCameraController({ polar: Math.PI / 4 });
    panOrbitCameraControllerInViewPlane(c, 0, 2);
    expect(c.target.x).toBeCloseTo(0);
    expect(c.target.y).toBeCloseTo(Math.SQRT2);
    expect(c.target.z).toBeCloseTo(-Math.SQRT2);
  });
});

describe('resetOrbitCameraController', () => {
  it('resets all coupled state from a seed', () => {
    const c = createOrbitCameraController({ target: createVector3(1, 2, 3) });
    resetOrbitCameraController(c, {
      azimuth: 1,
      distance: 4,
      maxDistance: 6,
      maxPolar: 0.5,
      polar: 0.25,
      target: createVector3(4, 5, 6),
    });
    expect(c).toMatchObject({ azimuth: 1, goalAzimuth: 1, distance: 4, goalDistance: 4, polar: 0.25 });
    expect(c.target).toMatchObject({ x: 4, y: 5, z: 6 });
  });
});

describe('snapOrbitCameraController', () => {
  it('snaps current values to clamped goals', () => {
    const c = createOrbitCameraController({ maxDistance: 6, maxPolar: 0.5 });
    c.goalDistance = 20;
    c.goalPolar = 2;
    snapOrbitCameraController(c);
    expect(c.distance).toBe(6);
    expect(c.polar).toBe(0.5);
  });
});

describe('updateOrbitCameraController', () => {
  it('snaps to the goal when smoothTime is 0 and writes the look-at view', () => {
    const c = createOrbitCameraController({ distance: 10 }); // azimuth 0, polar 0 => eye (0,0,10)
    const camera = testCamera();
    updateOrbitCameraController(c, camera, 0.016);
    expect(c.azimuth).toBe(c.goalAzimuth);

    const expected = testCamera();
    setCamera3DViewMatrix4FromLookAt(expected, createVector3(0, 0, 10), createVector3(0, 0, 0), createVector3(0, 1, 0));
    for (let i = 0; i < 16; i++) expect(camera.view.m[i]).toBeCloseTo(expected.view.m[i]);
  });

  it('eases toward the goal when smoothTime is positive', () => {
    const c = createOrbitCameraController({ smoothTime: 0.5 });
    orbitCameraController(c, 1, 0);
    updateOrbitCameraController(c, testCamera(), 0.016);
    expect(c.azimuth).toBeGreaterThan(0);
    expect(c.azimuth).toBeLessThan(1); // has not reached the goal in one small step
  });

  it('takes the shortest arc across the wrapped azimuth seam', () => {
    const c = createOrbitCameraController({ azimuth: Math.PI - 0.05, smoothTime: 0.5 });
    c.goalAzimuth = -Math.PI + 0.05;
    updateOrbitCameraController(c, testCamera(), 0.016);
    expect(c.azimuth).toBeGreaterThan(Math.PI - 0.05);
    expect(c.azimuth).toBeLessThan(Math.PI + 0.05);
  });
});
