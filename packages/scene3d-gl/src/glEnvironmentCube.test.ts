import type { Bitmap, Environment, Texture } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import {
  destroyGlEnvironmentSourceCube,
  ensureGlEnvironmentSourceCube,
  getGlCubeFaceTarget,
  updateGlEnvironmentCubeFace,
} from './glEnvironmentCube';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';

// The GPU upload + sampling is validated by the functional `env-skybox` capture (jsdom has no real
// WebGL2 cubemap). These cover the CPU-side guards: the face-target arithmetic, the "no complete
// cube" sentinel path that callers depend on to no-op, and the data-only face upload path.

function dataFace(size: number): Bitmap {
  return {
    data: new Uint8ClampedArray(size * size * 4),
    height: size,
    kind: BitmapTextureSourceKind,
    width: size,
  } as Bitmap;
}

function dataOnlyEnvironment(size: number): Environment {
  const face = dataFace(size);
  const cube = {
    colorSpace: 'srgb',
    sampler: {},
    dimension: 'cube',
    sources: [face, face, face, face, face, face],
  } as unknown as Texture;
  return { environment: cube, intensity: 1 } as Environment;
}

describe('destroyGlEnvironmentSourceCube', () => {
  it('is a no-op when nothing is cached', () => {
    const { state, gl } = makeGlScene3DState();
    const before = gl.calls.length;
    destroyGlEnvironmentSourceCube(state);
    expect(gl.calls.length).toBe(before);
  });

  it('frees the cached cube and clears the cache, so the next ensure uploads again', () => {
    const { state, gl } = makeGlScene3DState();
    const environment = dataOnlyEnvironment(4);
    const first = ensureGlEnvironmentSourceCube(state, environment);
    expect(first).not.toBeNull();
    // Identity caching is the whole reason this verb has to exist: without dropping the cache, a caller
    // that changes the cube keeps rendering the first one forever.
    expect(ensureGlEnvironmentSourceCube(state, environment)).toBe(first);

    destroyGlEnvironmentSourceCube(state);
    expect(gl.calls.filter((call) => call.name === 'deleteTexture').map((call) => call.args[0])).toContain(first);

    // The mock hands out one shared texture sentinel, so a fresh handle is not observable here; that a
    // SECOND upload happened is, and it is the actual claim — the cache was dropped rather than reused.
    const uploadsBefore = gl.calls.filter((call) => call.name === 'createTexture').length;
    expect(ensureGlEnvironmentSourceCube(state, environment)).not.toBeNull();
    expect(gl.calls.filter((call) => call.name === 'createTexture').length).toBe(uploadsBefore + 1);
  });

  it('clears the colour space with the cube it belonged to', () => {
    const { state } = makeGlScene3DState();
    ensureGlEnvironmentSourceCube(state, dataOnlyEnvironment(4));
    expect(getGlScene3DRuntime(state).environmentSourceCubeColorSpace).toBe('srgb');
    destroyGlEnvironmentSourceCube(state);
    // Left behind, it would pick the internal format for a face restamped onto the NEXT cube.
    expect(getGlScene3DRuntime(state).environmentSourceCubeColorSpace).toBe('linear');
  });
});

describe('ensureGlEnvironmentSourceCube', () => {
  it('returns null when the environment has no source cube', () => {
    const { state } = makeGlScene3DState();
    const environment = { environment: null, intensity: 1 } as Environment;
    expect(ensureGlEnvironmentSourceCube(state, environment)).toBe(null);
  });

  it('uploads a data-only cube through the raw-pixel texImage2D overload', () => {
    const { state, gl } = makeGlScene3DState();
    const environment = dataOnlyEnvironment(4);
    const texture = ensureGlEnvironmentSourceCube(state, environment);
    expect(texture).not.toBe(null);
    const uploads = gl.calls.filter((c) => c.name === 'texImage2D');
    expect(uploads.length).toBe(6);
    // The raw-pixel overload passes width/height/border and the data buffer (9 args), not an element (6 args).
    for (const upload of uploads) {
      expect(upload.args.length).toBe(9);
      expect(upload.args[2]).toBe(gl.SRGB8_ALPHA8);
      expect(upload.args[3]).toBe(4);
      expect(upload.args[4]).toBe(4);
      expect(upload.args[8]).toBeInstanceOf(Uint8ClampedArray);
    }
  });

  it('uses a linear internal format for a linear source cube', () => {
    const { state, gl } = makeGlScene3DState();
    const environment = dataOnlyEnvironment(4);
    environment.environment!.colorSpace = 'linear';
    ensureGlEnvironmentSourceCube(state, environment);
    expect(gl.calls.filter((c) => c.name === 'texImage2D').every((c) => c.args[2] === gl.RGBA)).toBe(true);
  });
});

describe('getGlCubeFaceTarget', () => {
  it('maps face index onto TEXTURE_CUBE_MAP_POSITIVE_X + face', () => {
    const gl = { TEXTURE_CUBE_MAP_POSITIVE_X: 0x8515 } as WebGL2RenderingContext;
    expect(getGlCubeFaceTarget(gl, 0)).toBe(0x8515);
    expect(getGlCubeFaceTarget(gl, 5)).toBe(0x851a);
  });
});

describe('updateGlEnvironmentCubeFace', () => {
  it('returns false when no source cube has been built yet', () => {
    const { state, gl } = makeGlScene3DState();
    expect(updateGlEnvironmentCubeFace(state, 2, dataFace(4))).toBe(false);
    expect(gl.calls.some((c) => c.name === 'texImage2D')).toBe(false);
  });

  it('restamps a single face of the built cube without rebuilding the other five', () => {
    const { state, gl } = makeGlScene3DState();
    ensureGlEnvironmentSourceCube(state, dataOnlyEnvironment(4));
    const afterBuild = gl.calls.filter((c) => c.name === 'texImage2D').length;
    expect(afterBuild).toBe(6);
    expect(updateGlEnvironmentCubeFace(state, 2, dataFace(4))).toBe(true);
    expect(gl.calls.filter((c) => c.name === 'texImage2D').length).toBe(afterBuild + 1);
  });
});
