import { createCamera3D, createPerspectiveProjection, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { EntityRuntimeKey } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import {
  cloneFlyCameraController,
  copyFlyCameraController,
  createFlyCameraController,
  lookFlyCameraController,
  moveFlyCameraController,
  resetFlyCameraController,
  snapFlyCameraController,
  updateFlyCameraController,
} from './flyCameraController';

function testCamera() {
  return createCamera3D({ far: 100, near: 0.1, projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }) });
}

describe('cloneFlyCameraController', () => {
  it('creates an independent Entity with the same value state', () => {
    const source = createFlyCameraController({ pitch: 0.2, position: createVector3(1, 2, 3), yaw: 0.4 });
    const clone = cloneFlyCameraController(source);
    expect(clone).toMatchObject({ pitch: 0.2, yaw: 0.4 });
    expect(EntityRuntimeKey in clone).toBe(true);
    expect(clone.position).not.toBe(source.position);
    clone.position.x = 10;
    expect(source.position.x).toBe(1);
  });
});

describe('copyFlyCameraController', () => {
  it('copies value state without sharing position or replacing runtime state', () => {
    const source = createFlyCameraController({ pitch: 0.2, position: createVector3(1, 2, 3), yaw: 0.4 });
    const out = createFlyCameraController();
    const runtime = { binding: null };
    out[EntityRuntimeKey] = runtime;
    copyFlyCameraController(out, source);

    expect(out).toMatchObject({ pitch: 0.2, yaw: 0.4 });
    expect(out[EntityRuntimeKey]).toBe(runtime);
    expect(out.position).not.toBe(source.position);
  });
});

describe('createFlyCameraController', () => {
  it('applies documented defaults with current equal to goal', () => {
    const c = createFlyCameraController();
    expect(c.yaw).toBe(0);
    expect(c.pitch).toBe(0);
    expect(c.goalYaw).toBe(c.yaw);
    expect(c.maxPitch).toBeLessThan(Math.PI / 2);
    expect(c.minPitch).toBeGreaterThan(-Math.PI / 2);
  });

  it('seeds from options', () => {
    const c = createFlyCameraController({ yaw: 0.5, pitch: 0.25, position: createVector3(1, 2, 3) });
    expect(c.yaw).toBe(0.5);
    expect(c.position.z).toBe(3);
  });

  it('produces an Entity', () => {
    expect(EntityRuntimeKey in createFlyCameraController()).toBe(true);
  });
});

describe('lookFlyCameraController', () => {
  it('adds to the goal angles and clamps pitch', () => {
    const c = createFlyCameraController({ minPitch: -1, maxPitch: 1 });
    lookFlyCameraController(c, 0.5, 2);
    expect(c.goalYaw).toBe(0.5);
    expect(c.goalPitch).toBe(1); // clamped
  });
});

describe('moveFlyCameraController', () => {
  it('translates along the horizontal heading at yaw 0', () => {
    const c = createFlyCameraController(); // yaw 0 => forward (0,0,-1), right (1,0,0)
    moveFlyCameraController(c, 2, 3, 1);
    expect(c.position.x).toBeCloseTo(3); // right
    expect(c.position.y).toBeCloseTo(1); // up
    expect(c.position.z).toBeCloseTo(-2); // forward is -Z
  });
});

describe('resetFlyCameraController', () => {
  it('resets all coupled state from a seed', () => {
    const c = createFlyCameraController({ position: createVector3(1, 2, 3), yaw: 1 });
    resetFlyCameraController(c, { maxPitch: 0.5, pitch: 0.25, position: createVector3(4, 5, 6), yaw: -1 });
    expect(c).toMatchObject({ goalPitch: 0.25, goalYaw: -1, pitch: 0.25, yaw: -1 });
    expect(c.position).toMatchObject({ x: 4, y: 5, z: 6 });
  });
});

describe('snapFlyCameraController', () => {
  it('snaps current angles to clamped goals', () => {
    const c = createFlyCameraController({ maxPitch: 0.5 });
    c.goalPitch = 2;
    c.goalYaw = 3;
    snapFlyCameraController(c);
    expect(c.pitch).toBe(0.5);
    expect(c.yaw).toBe(3);
  });
});

describe('updateFlyCameraController', () => {
  it('snaps to the goal when smoothTime is 0 and writes the look-at view', () => {
    const c = createFlyCameraController({ position: createVector3(0, 0, 5) }); // yaw/pitch 0 => looks toward -Z
    const camera = testCamera();
    updateFlyCameraController(c, camera, 0.016);
    expect(c.yaw).toBe(c.goalYaw);

    const expected = testCamera();
    setCamera3DViewMatrix4FromLookAt(expected, createVector3(0, 0, 5), createVector3(0, 0, 4), createVector3(0, 1, 0));
    for (let i = 0; i < 16; i++) expect(camera.view.m[i]).toBeCloseTo(expected.view.m[i]);
  });

  it('eases toward the goal when smoothTime is positive', () => {
    const c = createFlyCameraController({ smoothTime: 0.5 });
    lookFlyCameraController(c, 1, 0);
    updateFlyCameraController(c, testCamera(), 0.016);
    expect(c.yaw).toBeGreaterThan(0);
    expect(c.yaw).toBeLessThan(1);
  });

  it('takes the shortest arc across the wrapped yaw seam', () => {
    const c = createFlyCameraController({ smoothTime: 0.5, yaw: Math.PI - 0.05 });
    c.goalYaw = -Math.PI + 0.05;
    updateFlyCameraController(c, testCamera(), 0.016);
    expect(c.yaw).toBeGreaterThan(Math.PI - 0.05);
    expect(c.yaw).toBeLessThan(Math.PI + 0.05);
  });
});
