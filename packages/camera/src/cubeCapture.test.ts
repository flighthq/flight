import type { Vector3Like } from '@flighthq/types/contract';
import {
  CubeFaceNegativeX,
  CubeFaceNegativeY,
  CubeFaceNegativeZ,
  CubeFacePositiveX,
  CubeFacePositiveY,
  CubeFacePositiveZ,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { getCamera3DPosition } from './basis';
import { createCamera3D } from './camera';
import { getCubeCaptureFaceCamera3D } from './cubeCapture';
import { createPerspectiveProjection } from './projection';

function near(a: number, b: number, eps = 1e-5): void {
  expect(a).toBeCloseTo(b, -Math.log10(eps));
}

function makeCamera() {
  return createCamera3D({
    far: 1000,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
  });
}

describe('getCubeCaptureFaceCamera3D', () => {
  it('sets a 90-degree FOV square perspective projection', () => {
    const cam = makeCamera();
    getCubeCaptureFaceCamera3D(cam, { x: 0, y: 0, z: 0 }, CubeFacePositiveX);
    expect(cam.projection.kind).toBe('perspective');
    if (cam.projection.kind === 'perspective') {
      near(cam.projection.fovY, Math.PI * 0.5);
      near(cam.projection.aspect, 1);
    }
  });

  it('preserves near and far', () => {
    const cam = makeCamera();
    getCubeCaptureFaceCamera3D(cam, { x: 0, y: 0, z: 0 }, CubeFacePositiveX);
    expect(cam.near).toBe(0.1);
    expect(cam.far).toBe(1000);
  });

  it('positions the camera at the given point for every face', () => {
    const cam = makeCamera();
    const pos: Vector3Like = { x: 0, y: 0, z: 0 };
    const origin = { x: 3, y: -2, z: 7 };
    for (let face = 0; face < 6; face++) {
      getCubeCaptureFaceCamera3D(cam, origin, face);
      getCamera3DPosition(pos, cam);
      near(pos.x, origin.x);
      near(pos.y, origin.y);
      near(pos.z, origin.z);
    }
  });

  it('produces 6 distinct view matrices', () => {
    const cam = makeCamera();
    const views: number[][] = [];
    for (let face = 0; face < 6; face++) {
      getCubeCaptureFaceCamera3D(cam, { x: 0, y: 0, z: 0 }, face);
      views.push(Array.from(cam.view.m));
    }
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        const same = views[i].every((v, k) => Math.abs(v - views[j][k]) < 1e-6);
        expect(same).toBe(false);
      }
    }
  });

  it('looks along the correct axis for each face', () => {
    const cam = makeCamera();
    const pos = { x: 0, y: 0, z: 0 };

    getCubeCaptureFaceCamera3D(cam, pos, CubeFacePositiveX);
    const fwdPX = extractForward(cam);
    near(fwdPX.x, 1);
    near(fwdPX.y, 0);
    near(fwdPX.z, 0);

    getCubeCaptureFaceCamera3D(cam, pos, CubeFaceNegativeX);
    const fwdNX = extractForward(cam);
    near(fwdNX.x, -1);
    near(fwdNX.y, 0);
    near(fwdNX.z, 0);

    getCubeCaptureFaceCamera3D(cam, pos, CubeFacePositiveY);
    const fwdPY = extractForward(cam);
    near(fwdPY.x, 0);
    near(fwdPY.y, 1);
    near(fwdPY.z, 0);

    getCubeCaptureFaceCamera3D(cam, pos, CubeFaceNegativeY);
    const fwdNY = extractForward(cam);
    near(fwdNY.x, 0);
    near(fwdNY.y, -1);
    near(fwdNY.z, 0);

    getCubeCaptureFaceCamera3D(cam, pos, CubeFacePositiveZ);
    const fwdPZ = extractForward(cam);
    near(fwdPZ.x, 0);
    near(fwdPZ.y, 0);
    near(fwdPZ.z, 1);

    getCubeCaptureFaceCamera3D(cam, pos, CubeFaceNegativeZ);
    const fwdNZ = extractForward(cam);
    near(fwdNZ.x, 0);
    near(fwdNZ.y, 0);
    near(fwdNZ.z, -1);
  });
});

function extractForward(cam: ReturnType<typeof createCamera3D>): Vector3Like {
  const m = cam.view.m;
  return { x: -m[2], y: -m[6], z: -m[10] };
}
