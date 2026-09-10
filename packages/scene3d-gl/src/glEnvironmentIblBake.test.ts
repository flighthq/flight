import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { initializeGlCubeRenderTarget } from '@flighthq/render-gl/contract';
import type { Bitmap, CubeTexture, Environment, GlCubeRenderTarget } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import { ensureGlEnvironmentSourceCube } from './glEnvironmentCube';
import {
  bakeGlEnvironmentCaptureIbl,
  bakeGlEnvironmentIbl,
  destroyGlEnvironmentIblBakePrograms,
} from './glEnvironmentIblBake';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';

// The GPU bake (irradiance / prefiltered specular / BRDF LUT) is validated by the functional `env-ibl`
// capture — software jsdom has no float-cube render path. This covers the guard: with no source cube
// the bake is a no-op and leaves runtime.ibl null, so the PBR ambient falls back to the flat term.

function dataOnlyEnvironment(size: number): Environment & { environment: CubeTexture } {
  const face = {
    alphaType: 'straight',
    data: new Uint8ClampedArray(size * size * 4),
    format: 'rgba8unorm',
    gamut: 'srgb',
    height: size,
    kind: BitmapTextureSourceKind,
    version: 0,
    width: size,
  } as Bitmap;
  const cube = {
    colorSpace: 'srgb',
    dimension: 'cube',
    sampler: {},
    sources: [face, face, face, face, face, face],
    version: 0,
  } as unknown as CubeTexture;
  return { environment: cube, intensity: 1 } as Environment & { environment: CubeTexture };
}

function captureTarget(texture: WebGLTexture): GlCubeRenderTarget {
  const target = allocateEntity<GlCubeRenderTarget>();
  initializeGlCubeRenderTarget(target, 4, {} as WebGLFramebuffer, texture, null);
  return finishEntity(target);
}

describe('bakeGlEnvironmentCaptureIbl', () => {
  it('bakes from the capture texture without destroying the environment source cube', () => {
    const { state, gl } = makeGlScene3DState();
    const runtime = getGlScene3DRuntime(state);
    const environment = dataOnlyEnvironment(4);
    const previousSource = ensureGlEnvironmentSourceCube(state, environment)!;
    const capturedTexture = { name: 'captured-cube' } as WebGLTexture;

    bakeGlEnvironmentCaptureIbl(state, captureTarget(capturedTexture), 2.5);

    expect(runtime.environmentSourceCube).toBe(previousSource);
    expect(runtime.ibl?.environmentSourceRevision).toBe(runtime.environmentSourceRevision);
    expect(runtime.ibl?.intensity).toBe(2.5);
    expect(gl.calls.some((call) => call.name === 'deleteTexture' && call.args[0] === previousSource)).toBe(false);
    expect(gl.calls.some((call) => call.name === 'bindTexture' && call.args[1] === capturedTexture)).toBe(true);
  });
});

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
    const environment = dataOnlyEnvironment(4);
    ensureGlEnvironmentSourceCube(state, environment);
    // Stand in for a prior bake. The GPU bake needs a float-cube render path jsdom does not have, so the
    // replaced set is planted directly — what is under test is the ownership handoff, not the bake.
    const previous = {
      brdfLut: {} as WebGLTexture,
      environmentSourceRevision: (runtime.environmentSourceRevision - 1) >>> 0,
      intensity: 1,
      irradianceCube: {} as WebGLTexture,
      prefilteredCube: {} as WebGLTexture,
      prefilteredMipCount: 5,
    };
    runtime.ibl = previous;
    environment.intensity = 2;
    bakeGlEnvironmentIbl(state, environment);

    const deleted = gl.calls.filter((call) => call.name === 'deleteTexture').map((call) => call.args[0]);
    expect(deleted).toContain(previous.irradianceCube);
    expect(deleted).toContain(previous.prefilteredCube);
    // The LUT is environment-independent and is carried forward into the new set, so freeing it would
    // delete a texture the runtime still points at.
    expect(deleted).not.toContain(previous.brdfLut);
  });

  it('updates intensity without rebaking when the environment source revision is unchanged', () => {
    const { state, gl } = makeGlScene3DState();
    const environment = dataOnlyEnvironment(4);
    ensureGlEnvironmentSourceCube(state, environment);
    const runtime = getGlScene3DRuntime(state);
    runtime.ibl = {
      brdfLut: {} as WebGLTexture,
      environmentSourceRevision: runtime.environmentSourceRevision,
      intensity: 1,
      irradianceCube: {} as WebGLTexture,
      prefilteredCube: {} as WebGLTexture,
      prefilteredMipCount: 5,
    };
    const callsBefore = gl.calls.length;
    environment.intensity = 3;

    bakeGlEnvironmentIbl(state, environment);

    expect(runtime.ibl.intensity).toBe(3);
    expect(gl.calls.slice(callsBefore).some((call) => call.name === 'createFramebuffer')).toBe(false);
    expect(gl.calls.slice(callsBefore).some((call) => call.name === 'deleteTexture')).toBe(false);
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
