import { createCamera3D, createPerspectiveProjection } from '@flighthq/camera/contract';
import type { Bitmap, Environment, Texture } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import { drawGlEnvironmentSkybox } from './glEnvironmentSkybox';
import { makeGlScene3DState } from './glScene3DTestHelper';

// The skybox draw itself is validated by the functional `env-skybox` capture. This covers the guard:
// with no complete source cube the pass is a no-op (it must not touch GL), so an app that always calls
// it before drawGlScene3D pays nothing until an environment is bound.

describe('drawGlEnvironmentSkybox', () => {
  it('is a no-op when the environment has no source cube', () => {
    const { state, gl } = makeGlScene3DState();
    const environment = { environment: null, intensity: 1 } as Environment;
    const camera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });
    const before = gl.calls.length;
    expect(() => drawGlEnvironmentSkybox(state, environment, camera, 1)).not.toThrow();
    expect(gl.calls.length).toBe(before);
  });

  it('restores the depth test and blend bits the caller had', () => {
    const { state, gl } = makeGlScene3DState();
    const face = {
      data: new Uint8ClampedArray(4 * 4 * 4),
      height: 4,
      kind: BitmapTextureSourceKind,
      width: 4,
    } as Bitmap;
    const environment = {
      environment: {
        colorSpace: 'srgb',
        dimension: 'cube',
        sampler: {},
        sources: [face, face, face, face, face, face],
      } as unknown as Texture,
      intensity: 1,
    } as Environment;
    const camera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });
    // Both ON going in, which is what a caller mid-frame actually has. The pass turns both off for its
    // own draw; blend was previously never turned back on, and the 2D path enables blend once per state,
    // so that leak outlived the frame it happened in.
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);

    drawGlEnvironmentSkybox(state, environment, camera, 1);

    expect(gl.isEnabled(gl.DEPTH_TEST)).toBe(true);
    expect(gl.isEnabled(gl.BLEND)).toBe(true);
  });

  it('refreshes and uploads Camera3D.inverseViewProjection', () => {
    const { state, gl } = makeGlScene3DState();
    const face = {
      data: new Uint8ClampedArray(4 * 4 * 4),
      height: 4,
      kind: BitmapTextureSourceKind,
      width: 4,
    } as Bitmap;
    const environment = {
      environment: {
        colorSpace: 'srgb',
        dimension: 'cube',
        sampler: {},
        sources: [face, face, face, face, face, face],
      } as unknown as Texture,
      intensity: 1,
    } as Environment;
    const camera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
    });
    camera.inverseViewProjection.m[0] = 42;
    drawGlEnvironmentSkybox(state, environment, camera, 1);
    expect(camera.inverseViewProjection.m[0]).not.toBe(42);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv' && c.args[2] === camera.inverseViewProjection.m)).toBe(
      true,
    );
  });
});
