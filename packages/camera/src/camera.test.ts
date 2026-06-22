import { createMatrix4, createVector3, inverseMatrix4, multiplyMatrix4, setMatrix4LookAt } from '@flighthq/geometry';

import {
  createCamera,
  getCameraInverseViewProjectionMatrix4,
  getCameraViewProjectionMatrix4,
  setCameraJitter,
  setCameraViewMatrix4FromLookAt,
  setCameraViewMatrix4FromMatrix4,
} from './camera';
import { createPerspectiveProjection, setProjectionMatrix4 } from './projection';

describe('createCamera', () => {
  it('stores projection, near, far and identity view/inverse with zero jitter', () => {
    const projection = createPerspectiveProjection({ aspect: 1, fovY: 1 });
    const camera = createCamera({ far: 100, near: 0.1, projection });

    expect(camera.projection).toBe(projection);
    expect(camera.near).toBe(0.1);
    expect(camera.far).toBe(100);
    expect(camera.jitter.x).toBe(0);
    expect(camera.jitter.y).toBe(0);
    expect(camera.view.m[0]).toBe(1);
    expect(camera.view.m[5]).toBe(1);
    expect(camera.inverseViewProjection.m[10]).toBe(1);
  });
});

describe('getCameraInverseViewProjectionMatrix4', () => {
  it('writes the inverse of the view-projection into a distinct out', () => {
    const projection = createPerspectiveProjection({ aspect: 1, fovY: 1 });
    const camera = createCamera({ far: 100, near: 0.1, projection });
    setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));

    const viewProjection = createMatrix4();
    getCameraViewProjectionMatrix4(viewProjection, camera, 1.5);

    const expected = createMatrix4();
    inverseMatrix4(expected, viewProjection);

    const out = createMatrix4();
    expect(getCameraInverseViewProjectionMatrix4(out, camera, 1.5)).toBe(true);
    for (let i = 0; i < 16; i++) {
      expect(out.m[i]).toBeCloseTo(expected.m[i]);
    }
  });

  it('is safe when out aliases the camera inverseViewProjection', () => {
    const projection = createPerspectiveProjection({ aspect: 1, fovY: 1 });
    const camera = createCamera({ far: 100, near: 0.1, projection });
    setCameraViewMatrix4FromLookAt(camera, createVector3(2, 1, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));

    const viewProjection = createMatrix4();
    getCameraViewProjectionMatrix4(viewProjection, camera, 1.3);
    const expected = createMatrix4();
    inverseMatrix4(expected, viewProjection);

    expect(getCameraInverseViewProjectionMatrix4(camera.inverseViewProjection, camera, 1.3)).toBe(true);
    for (let i = 0; i < 16; i++) {
      expect(camera.inverseViewProjection.m[i]).toBeCloseTo(expected.m[i]);
    }
  });
});

describe('getCameraViewProjectionMatrix4', () => {
  it('writes projection times view into a distinct out', () => {
    const projection = createPerspectiveProjection({ aspect: 1, fovY: 1 });
    const camera = createCamera({ far: 100, near: 0.1, projection });
    setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));

    const out = createMatrix4();
    getCameraViewProjectionMatrix4(out, camera, 2);

    const projectionMatrix = createMatrix4();
    setProjectionMatrix4(projectionMatrix, projection, 2, camera.near, camera.far);
    const expected = createMatrix4();
    multiplyMatrix4(expected, projectionMatrix, camera.view);

    for (let i = 0; i < 16; i++) {
      expect(out.m[i]).toBeCloseTo(expected.m[i]);
    }
  });

  it('is safe when out aliases the camera view', () => {
    const projection = createPerspectiveProjection({ aspect: 1, fovY: 1 });
    const camera = createCamera({ far: 100, near: 0.1, projection });
    setCameraViewMatrix4FromLookAt(camera, createVector3(1, 2, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

    const projectionMatrix = createMatrix4();
    setProjectionMatrix4(projectionMatrix, projection, 1.7, camera.near, camera.far);
    const expected = createMatrix4();
    multiplyMatrix4(expected, projectionMatrix, camera.view);

    getCameraViewProjectionMatrix4(camera.view, camera, 1.7);
    for (let i = 0; i < 16; i++) {
      expect(camera.view.m[i]).toBeCloseTo(expected.m[i]);
    }
  });
});

describe('setCameraJitter', () => {
  it('sets the jitter offset in place', () => {
    const camera = createCamera({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });
    const jitter = camera.jitter;
    setCameraJitter(camera, 0.25, -0.5);
    expect(camera.jitter).toBe(jitter);
    expect(camera.jitter.x).toBe(0.25);
    expect(camera.jitter.y).toBe(-0.5);
  });
});

describe('setCameraViewMatrix4FromLookAt', () => {
  it('builds the view matrix from eye-target-up', () => {
    const camera = createCamera({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });
    const eye = createVector3(0, 0, 10);
    const target = createVector3(0, 0, 0);
    const up = createVector3(0, 1, 0);
    setCameraViewMatrix4FromLookAt(camera, eye, target, up);

    const expected = createMatrix4();
    setMatrix4LookAt(expected, eye, target, up);
    for (let i = 0; i < 16; i++) {
      expect(camera.view.m[i]).toBeCloseTo(expected.m[i]);
    }
  });
});

describe('setCameraViewMatrix4FromMatrix4', () => {
  it('copies a precomputed view matrix into the camera', () => {
    const camera = createCamera({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });
    const view = createMatrix4();
    setMatrix4LookAt(view, createVector3(3, 3, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

    const target = camera.view;
    setCameraViewMatrix4FromMatrix4(camera, view);
    // Copied in place: the camera's own view matrix instance is retained.
    expect(camera.view).toBe(target);
    for (let i = 0; i < 16; i++) {
      expect(camera.view.m[i]).toBeCloseTo(view.m[i]);
    }
  });
});
