import { createCamera3D, createPerspectiveProjection } from '@flighthq/camera';
import type { Environment } from '@flighthq/types/contract';

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
});
