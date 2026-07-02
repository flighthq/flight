import type { Environment } from '@flighthq/types';

import { bakeEnvironmentIbl, destroyGlBakePrograms } from './glEnvironmentIblBake';
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

describe('destroyGlBakePrograms', () => {
  // The bake shader programs are created only along the float-cube render path, which jsdom cannot
  // drive (see the note above); their teardown is exercised end-to-end by the functional capture.
  // Here we cover the guard: with no bake having run for the state, teardown is a safe, repeatable
  // no-op that issues no GL deletes.
  it('is a safe no-op when no bake ran for the state', () => {
    const { state, gl } = makeGlSceneState();
    destroyGlBakePrograms(state);
    destroyGlBakePrograms(state);
    expect(gl.calls.some((c) => c.name.startsWith('delete'))).toBe(false);
  });
});
