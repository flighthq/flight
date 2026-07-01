import type { Environment } from '@flighthq/types';

import { ensureGlEnvironmentSourceCube, getGlCubeFaceTarget } from './glEnvironmentCube';
import { makeGlSceneState } from './glSceneTestHelper';

// The GPU upload + sampling is validated by the functional `env-skybox` capture (jsdom has no real
// WebGL2 cubemap). These cover the CPU-side guards: the face-target arithmetic and the "no complete
// cube" sentinel path that callers depend on to no-op.

describe('ensureGlEnvironmentSourceCube', () => {
  it('returns null when the environment has no source cube', () => {
    const { state } = makeGlSceneState();
    const environment = { environment: null, intensity: 1 } as Environment;
    expect(ensureGlEnvironmentSourceCube(state, environment)).toBe(null);
  });
});

describe('getGlCubeFaceTarget', () => {
  it('maps face index onto TEXTURE_CUBE_MAP_POSITIVE_X + face', () => {
    const gl = { TEXTURE_CUBE_MAP_POSITIVE_X: 0x8515 } as WebGL2RenderingContext;
    expect(getGlCubeFaceTarget(gl, 0)).toBe(0x8515);
    expect(getGlCubeFaceTarget(gl, 5)).toBe(0x851a);
  });
});
