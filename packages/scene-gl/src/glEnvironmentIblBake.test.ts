import type { Environment } from '@flighthq/types';

import { bakeEnvironmentIbl } from './glEnvironmentIblBake';
import { getGlSceneRuntime } from './glSceneRuntime';
import { makeGlSceneState } from './glSceneTestHelper';

// The GPU bake (irradiance / prefiltered specular / BRDF LUT) is validated by the functional `env-ibl`
// capture — software jsdom has no float-cube render path. This covers the guard: with no source cube
// the bake is a no-op and leaves runtime.ibl null, so the PBR ambient falls back to the flat term.

describe('bakeEnvironmentIbl', () => {
  it('is a no-op leaving runtime.ibl null when the environment has no source cube', () => {
    const { state } = makeGlSceneState();
    const environment = { environment: null, intensity: 1 } as Environment;
    bakeEnvironmentIbl(state, environment);
    expect(getGlSceneRuntime(state).ibl).toBe(null);
  });
});
