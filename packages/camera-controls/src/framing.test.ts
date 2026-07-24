import { createOrthographicProjection, createPerspectiveProjection } from '@flighthq/camera';
import { createBoundingSphere } from '@flighthq/geometry';
import { describe, expect, it } from 'vitest';

import {
  frameOrbitCameraControllerToSphere,
  getPerspectiveProjectionFrameDistanceToSphere,
  setOrthographicProjectionFrameToSphere,
} from './framing';
import { createOrbitCameraController } from './orbitCameraController';

describe('frameOrbitCameraControllerToSphere', () => {
  it('targets the center and changes only goal distance for perspective', () => {
    const controller = createOrbitCameraController({ distance: 10 });
    const projection = createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 2 });
    const sphere = createBoundingSphere(1, 2, 3, 2);
    expect(frameOrbitCameraControllerToSphere(controller, projection, sphere, 1)).toBe(true);
    expect(controller.target).toMatchObject({ x: 1, y: 2, z: 3 });
    expect(controller.distance).toBe(10);
    expect(controller.goalDistance).toBeCloseTo(2 / Math.sin(Math.PI / 4));
  });

  it('targets the center and changes only projection extent for orthographic', () => {
    const controller = createOrbitCameraController({ distance: 10 });
    const projection = createOrthographicProjection({ halfHeight: 1, halfWidth: 1 });
    const sphere = createBoundingSphere(1, 2, 3, 2);
    expect(frameOrbitCameraControllerToSphere(controller, projection, sphere, 2)).toBe(true);
    expect(controller.target).toMatchObject({ x: 1, y: 2, z: 3 });
    expect(controller.goalDistance).toBe(10);
    expect(projection).toMatchObject({ halfHeight: 2, halfWidth: 4 });
  });

  it('does not mutate for empty spheres or invalid viewport inputs', () => {
    const controller = createOrbitCameraController({ target: { x: 1, y: 2, z: 3 } });
    const projection = createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 2 });
    expect(frameOrbitCameraControllerToSphere(controller, projection, createBoundingSphere(), 1)).toBe(false);
    expect(frameOrbitCameraControllerToSphere(controller, projection, createBoundingSphere(0, 0, 0, 2), 0)).toBe(false);
    expect(controller.target).toMatchObject({ x: 1, y: 2, z: 3 });
  });
});

describe('getPerspectiveProjectionFrameDistanceToSphere', () => {
  it('uses the limiting vertical field for a wide viewport', () => {
    const projection = createPerspectiveProjection({ aspect: 2, fovY: Math.PI / 2 });
    expect(getPerspectiveProjectionFrameDistanceToSphere(projection, 2, 2)).toBeCloseTo(2 / Math.sin(Math.PI / 4));
  });

  it('uses the limiting horizontal field for a tall viewport', () => {
    const projection = createPerspectiveProjection({ aspect: 0.5, fovY: Math.PI / 2 });
    const horizontalHalfFov = Math.atan(0.5);
    expect(getPerspectiveProjectionFrameDistanceToSphere(projection, 2, 0.5)).toBeCloseTo(
      2 / Math.sin(horizontalHalfFov),
    );
  });
});

describe('setOrthographicProjectionFrameToSphere', () => {
  it('preserves wide and tall viewport aspect while containing the sphere', () => {
    const wide = createOrthographicProjection({ halfHeight: 1, halfWidth: 1 });
    setOrthographicProjectionFrameToSphere(wide, 2, 2, 1.5);
    expect(wide).toMatchObject({ halfHeight: 3, halfWidth: 6 });

    const tall = createOrthographicProjection({ halfHeight: 1, halfWidth: 1 });
    setOrthographicProjectionFrameToSphere(tall, 2, 0.5, 1.5);
    expect(tall).toMatchObject({ halfHeight: 6, halfWidth: 3 });
  });
});
