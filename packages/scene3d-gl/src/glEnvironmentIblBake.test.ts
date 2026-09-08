import type { Environment } from '@flighthq/types/contract';

import { bakeGlEnvironmentIbl, destroyGlEnvironmentIblBakePrograms } from './glEnvironmentIblBake';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';

// The GPU bake (irradiance / prefiltered specular / BRDF LUT) is validated by the functional `env-ibl`
// capture — software jsdom has no float-cube render path. This covers the guard: with no source cube
// the bake is a no-op and leaves runtime.ibl null, so the PBR ambient falls back to the flat term.

describe('bakeGlEnvironmentIbl', () => {
  it('is a no-op leaving runtime.ibl null when the environment has no source cube', () => {
    const { state } = makeGlScene3DState();
    const environment = { environment: null, intensity: 1 } as Environment;
    bakeGlEnvironmentIbl(state, environment);
    expect(getGlScene3DRuntime(state).ibl).toBe(null);
  });
});

describe('bakeGlEnvironmentIbl rebake ownership', () => {
  it('frees the irradiance and prefiltered cubes it replaces, and keeps the reused BRDF LUT', () => {
    const { state, gl } = makeGlScene3DState();
    const runtime = getGlScene3DRuntime(state);
    // Stand in for a prior bake. The GPU bake needs a float-cube render path jsdom does not have, so the
    // replaced set is planted directly — what is under test is the ownership handoff, not the bake.
    const previous = {
      brdfLut: {} as WebGLTexture,
      intensity: 1,
      irradianceCube: {} as WebGLTexture,
      prefilteredCube: {} as WebGLTexture,
      prefilteredMipCount: 5,
    };
    runtime.ibl = previous;
    runtime.environmentSourceCube = {} as WebGLTexture;

    const environment = { environment: null, intensity: 2 } as unknown as Environment;
    bakeGlEnvironmentIbl(state, environment);

    const deleted = gl.calls.filter((call) => call.name === 'deleteTexture').map((call) => call.args[0]);
    expect(deleted).toContain(previous.irradianceCube);
    expect(deleted).toContain(previous.prefilteredCube);
    // The LUT is environment-independent and is carried forward into the new set, so freeing it would
    // delete a texture the runtime still points at.
    expect(deleted).not.toContain(previous.brdfLut);
  });
});

describe('destroyGlEnvironmentIblBakePrograms', () => {
  // The bake shader programs are created only along the float-cube render path, which jsdom cannot
  // drive (see the note above); their teardown is exercised end-to-end by the functional capture.
  // Here we cover the guard: with no bake having run for the state, teardown is a safe, repeatable
  // no-op that issues no GL deletes.
  it('is a safe no-op when no bake ran for the state', () => {
    const { state, gl } = makeGlScene3DState();
    destroyGlEnvironmentIblBakePrograms(state);
    destroyGlEnvironmentIblBakePrograms(state);
    expect(gl.calls.some((c) => c.name.startsWith('delete'))).toBe(false);
  });
});
