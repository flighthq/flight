import { createMatrix4, createVector3, inverseMatrix4, multiplyMatrix4, setMatrix4LookAt } from '@flighthq/geometry';

import {
  createCamera3D,
  getCamera3DInverseViewProjectionMatrix4,
  getCamera3DViewProjectionMatrix4,
  setCamera3DAspect,
  setCamera3DJitter,
  setCamera3DViewMatrix4FromLookAt,
  setCamera3DViewMatrix4FromMatrix4,
  updateCamera3DInverseViewProjection,
} from './camera';
import { createOrthographicProjection, createPerspectiveProjection, setProjectionMatrix4 } from './projection';

describe('createCamera3D', () => {
  it('stores projection, near, far and identity view/inverse with zero jitter', () => {
    const projection = createPerspectiveProjection({ aspect: 1, fovY: 1 });
    const camera = createCamera3D({ far: 100, near: 0.1, projection });

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

describe('getCamera3DInverseViewProjectionMatrix4', () => {
  it('writes the inverse of the view-projection into a distinct out', () => {
    const projection = createPerspectiveProjection({ aspect: 1, fovY: 1 });
    const camera = createCamera3D({ far: 100, near: 0.1, projection });
    setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));

    const viewProjection = createMatrix4();
    getCamera3DViewProjectionMatrix4(viewProjection, camera, 1.5);

    const expected = createMatrix4();
    inverseMatrix4(expected, viewProjection);

    const out = createMatrix4();
    expect(getCamera3DInverseViewProjectionMatrix4(out, camera, 1.5)).toBe(true);
    for (let i = 0; i < 16; i++) {
      expect(out.m[i]).toBeCloseTo(expected.m[i]);
    }
  });

  it('is safe when out aliases the camera inverseViewProjection', () => {
    const projection = createPerspectiveProjection({ aspect: 1, fovY: 1 });
    const camera = createCamera3D({ far: 100, near: 0.1, projection });
    setCamera3DViewMatrix4FromLookAt(camera, createVector3(2, 1, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));

    const viewProjection = createMatrix4();
    getCamera3DViewProjectionMatrix4(viewProjection, camera, 1.3);
    const expected = createMatrix4();
    inverseMatrix4(expected, viewProjection);

    expect(getCamera3DInverseViewProjectionMatrix4(camera.inverseViewProjection, camera, 1.3)).toBe(true);
    for (let i = 0; i < 16; i++) {
      expect(camera.inverseViewProjection.m[i]).toBeCloseTo(expected.m[i]);
    }
  });
});

describe('getCamera3DViewProjectionMatrix4', () => {
  it('writes projection times view into a distinct out', () => {
    const projection = createPerspectiveProjection({ aspect: 1, fovY: 1 });
    const camera = createCamera3D({ far: 100, near: 0.1, projection });
    setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));

    const out = createMatrix4();
    getCamera3DViewProjectionMatrix4(out, camera, 2);

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
    const camera = createCamera3D({ far: 100, near: 0.1, projection });
    setCamera3DViewMatrix4FromLookAt(camera, createVector3(1, 2, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

    const projectionMatrix = createMatrix4();
    setProjectionMatrix4(projectionMatrix, projection, 1.7, camera.near, camera.far);
    const expected = createMatrix4();
    multiplyMatrix4(expected, projectionMatrix, camera.view);

    getCamera3DViewProjectionMatrix4(camera.view, camera, 1.7);
    for (let i = 0; i < 16; i++) {
      expect(camera.view.m[i]).toBeCloseTo(expected.m[i]);
    }
  });
});

describe('setCamera3DAspect', () => {
  it('writes the aspect on a perspective projection in place', () => {
    const projection = createPerspectiveProjection({ aspect: 1, fovY: 1 });
    const camera = createCamera3D({ far: 100, near: 0.1, projection });
    setCamera3DAspect(camera, 16 / 9);
    // Same object, mutated in place — no cast needed to read the narrowed field.
    expect(projection.aspect).toBeCloseTo(16 / 9);
    expect(camera.projection).toBe(projection);
  });

  it('widens an orthographic view volume to the aspect, preserving half-height', () => {
    const projection = createOrthographicProjection({ halfHeight: 5, halfWidth: 5 });
    const camera = createCamera3D({ far: 100, near: 0.1, projection });
    setCamera3DAspect(camera, 2);
    expect(projection.halfHeight).toBe(5);
    expect(projection.halfWidth).toBe(10);
  });
});

describe('setCamera3DJitter', () => {
  it('sets the jitter offset in place', () => {
    const camera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });
    const jitter = camera.jitter;
    setCamera3DJitter(camera, 0.25, -0.5);
    expect(camera.jitter).toBe(jitter);
    expect(camera.jitter.x).toBe(0.25);
    expect(camera.jitter.y).toBe(-0.5);
  });
});

describe('setCamera3DViewMatrix4FromLookAt', () => {
  it('builds the view matrix from eye-target-up', () => {
    const camera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });
    const eye = createVector3(0, 0, 10);
    const target = createVector3(0, 0, 0);
    const up = createVector3(0, 1, 0);
    setCamera3DViewMatrix4FromLookAt(camera, eye, target, up);

    const expected = createMatrix4();
    setMatrix4LookAt(expected, eye, target, up);
    for (let i = 0; i < 16; i++) {
      expect(camera.view.m[i]).toBeCloseTo(expected.m[i]);
    }
  });
});

describe('setCamera3DViewMatrix4FromMatrix4', () => {
  it('copies a precomputed view matrix into the camera', () => {
    const camera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });
    const view = createMatrix4();
    setMatrix4LookAt(view, createVector3(3, 3, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

    const target = camera.view;
    setCamera3DViewMatrix4FromMatrix4(camera, view);
    // Copied in place: the camera's own view matrix instance is retained.
    expect(camera.view).toBe(target);
    for (let i = 0; i < 16; i++) {
      expect(camera.view.m[i]).toBeCloseTo(view.m[i]);
    }
  });
});

describe('updateCamera3DInverseViewProjection', () => {
  it('stores the inverse view-projection into camera.inverseViewProjection and returns true', () => {
    const projection = createPerspectiveProjection({ aspect: 1, fovY: 1 });
    const camera = createCamera3D({ far: 100, near: 0.1, projection });
    setCamera3DViewMatrix4FromLookAt(camera, createVector3(1, 2, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));

    const result = updateCamera3DInverseViewProjection(camera, 1.5);
    expect(result).toBe(true);

    // Compute expected inverse independently.
    const vp = createMatrix4();
    getCamera3DViewProjectionMatrix4(vp, camera, 1.5);
    const expected = createMatrix4();
    inverseMatrix4(expected, vp);

    for (let i = 0; i < 16; i++) {
      expect(camera.inverseViewProjection.m[i]).toBeCloseTo(expected.m[i]);
    }
  });

  it('returns false and leaves inverseViewProjection untouched for a non-invertible matrix', () => {
    const projection = createPerspectiveProjection({ aspect: 1, fovY: 1 });
    const camera = createCamera3D({ far: 100, near: 0.1, projection });
    camera.near = 1;
    camera.far = 1; // Degenerate.
    // Store a known value so we can confirm it was not overwritten.
    camera.inverseViewProjection.m[0] = 42;

    const result = updateCamera3DInverseViewProjection(camera, 1);
    expect(result).toBe(false);
    expect(camera.inverseViewProjection.m[0]).toBe(42);
  });
});
