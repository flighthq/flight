import { createMatrix4, createPlane } from '@flighthq/geometry/contract';
import type { Vector3Like } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { getCamera3DForward, getCamera3DPosition } from './basis';
import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from './camera';
import { createPerspectiveProjection, setProjectionMatrix4 } from './projection';
import { applyObliqueNearClipPlane, reflectCamera3DByPlane } from './reflection';

function near(a: number, b: number, eps = 1e-5): void {
  expect(a).toBeCloseTo(b, -Math.log10(eps));
}

function perspectiveCamera(): ReturnType<typeof createCamera3D> {
  const cam = createCamera3D({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 3 }),
  });
  setCamera3DViewMatrix4FromLookAt(cam, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return cam;
}

function elevatedCamera(): ReturnType<typeof createCamera3D> {
  const cam = createCamera3D({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 3 }),
  });
  setCamera3DViewMatrix4FromLookAt(cam, { x: 2, y: 5, z: 3 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return cam;
}

function emptyCamera(): ReturnType<typeof createCamera3D> {
  return createCamera3D({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 3 }),
  });
}

describe('applyObliqueNearClipPlane', () => {
  it('replaces the near plane row of a perspective projection', () => {
    const proj = createMatrix4();
    const cam = perspectiveCamera();
    setProjectionMatrix4(proj, cam.projection, 1, cam.near, cam.far);
    const origM0 = proj.m[0];
    const origM5 = proj.m[5];
    const origM10 = proj.m[10];
    const origM14 = proj.m[14];
    applyObliqueNearClipPlane(proj, createPlane(0, 0, -1, -1));
    expect(proj.m[0]).toBe(origM0);
    expect(proj.m[5]).toBe(origM5);
    expect(proj.m[10]).not.toBe(origM10);
    expect(proj.m[14]).not.toBe(origM14);
  });

  it('clips at the given view-space plane', () => {
    const proj = createMatrix4();
    const cam = perspectiveCamera();
    setProjectionMatrix4(proj, cam.projection, 1, cam.near, cam.far);
    const clipPlane = createPlane(0, 0, -1, -2);
    applyObliqueNearClipPlane(proj, clipPlane);
    const pointOnPlane: Vector3Like = { x: 0, y: 0, z: -2 };
    const m = proj.m;
    const clipZ = m[2] * pointOnPlane.x + m[6] * pointOnPlane.y + m[10] * pointOnPlane.z + m[14];
    const clipW = m[3] * pointOnPlane.x + m[7] * pointOnPlane.y + m[11] * pointOnPlane.z + m[15];
    near(clipZ / clipW, -1, 1e-4);
  });
});

describe('reflectCamera3DByPlane', () => {
  it('reflects a camera through a horizontal plane at the origin', () => {
    const cam = elevatedCamera();
    const out = emptyCamera();
    reflectCamera3DByPlane(out, cam, createPlane(0, 1, 0, 0));
    const pos: Vector3Like = { x: 0, y: 0, z: 0 };
    getCamera3DPosition(pos, out);
    near(pos.x, 2);
    near(pos.y, -5);
    near(pos.z, 3);
  });

  it('reflects a camera through the XZ plane at y=0', () => {
    const cam = createCamera3D({
      far: 50,
      near: 0.5,
      projection: createPerspectiveProjection({ aspect: 16 / 9, fovY: Math.PI / 4 }),
    });
    setCamera3DViewMatrix4FromLookAt(cam, { x: 3, y: 2, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const out = emptyCamera();
    reflectCamera3DByPlane(out, cam, createPlane(0, 1, 0, 0));
    expect(out.near).toBe(0.5);
    expect(out.far).toBe(50);
  });

  it('reflects through an offset plane', () => {
    const cam = elevatedCamera();
    const out = emptyCamera();
    reflectCamera3DByPlane(out, cam, createPlane(0, 1, 0, -2));
    const pos: Vector3Like = { x: 0, y: 0, z: 0 };
    getCamera3DPosition(pos, out);
    near(pos.x, 2);
    near(pos.y, -1);
    near(pos.z, 3);
  });

  it('is alias-safe when out equals camera', () => {
    const cam = elevatedCamera();
    reflectCamera3DByPlane(cam, cam, createPlane(0, 1, 0, 0));
    const pos: Vector3Like = { x: 0, y: 0, z: 0 };
    getCamera3DPosition(pos, cam);
    near(pos.y, -5);
  });

  it('preserves view-direction symmetry for identity reflection (plane parallel to view)', () => {
    const cam = perspectiveCamera();
    const out = emptyCamera();
    const zPlane = createPlane(0, 0, 1, 0);
    reflectCamera3DByPlane(out, cam, zPlane);
    const fwd: Vector3Like = { x: 0, y: 0, z: 0 };
    getCamera3DForward(fwd, out);
    near(fwd.x, 0);
    near(fwd.y, 0);
  });

  it('double reflection is identity', () => {
    const cam = elevatedCamera();
    const tmp = emptyCamera();
    const out = emptyCamera();
    const plane = createPlane(0, 1, 0, 0);
    reflectCamera3DByPlane(tmp, cam, plane);
    reflectCamera3DByPlane(out, tmp, plane);
    for (let i = 0; i < 16; i++) {
      near(out.view.m[i], cam.view.m[i], 1e-4);
    }
  });
});
