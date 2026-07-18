import type { CubeTexture, Environment, ImageResource } from '@flighthq/types';

import { ensureGlEnvironmentSourceCube, getGlCubeFaceTarget, updateGlEnvironmentCubeFace } from './glEnvironmentCube';
import { makeGlSceneState } from './glSceneTestHelper';

// The GPU upload + sampling is validated by the functional `env-skybox` capture (jsdom has no real
// WebGL2 cubemap). These cover the CPU-side guards: the face-target arithmetic, the "no complete
// cube" sentinel path that callers depend on to no-op, and the data-only face upload path.

function dataFace(size: number): ImageResource {
  return { source: null, data: new Uint8ClampedArray(size * size * 4), width: size, height: size } as ImageResource;
}

function dataOnlyEnvironment(size: number): Environment {
  const face = dataFace(size);
  const cube = {
    colorSpace: 'srgb',
    faces: [face, face, face, face, face, face],
    sampler: {},
  } as unknown as CubeTexture;
  return { environment: cube, intensity: 1 } as Environment;
}

describe('ensureGlEnvironmentSourceCube', () => {
  it('returns null when the environment has no source cube', () => {
    const { state } = makeGlSceneState();
    const environment = { environment: null, intensity: 1 } as Environment;
    expect(ensureGlEnvironmentSourceCube(state, environment)).toBe(null);
  });

  it('uploads a data-only cube through the raw-pixel texImage2D overload', () => {
    const { state, gl } = makeGlSceneState();
    const environment = dataOnlyEnvironment(4);
    const texture = ensureGlEnvironmentSourceCube(state, environment);
    expect(texture).not.toBe(null);
    const uploads = gl.calls.filter((c) => c.name === 'texImage2D');
    expect(uploads.length).toBe(6);
    // The raw-pixel overload passes width/height/border and the data buffer (9 args), not an element (6 args).
    for (const upload of uploads) {
      expect(upload.args.length).toBe(9);
      expect(upload.args[3]).toBe(4);
      expect(upload.args[4]).toBe(4);
      expect(upload.args[8]).toBeInstanceOf(Uint8ClampedArray);
    }
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
    const { state, gl } = makeGlSceneState();
    expect(updateGlEnvironmentCubeFace(state, 2, dataFace(4))).toBe(false);
    expect(gl.calls.some((c) => c.name === 'texImage2D')).toBe(false);
  });

  it('restamps a single face of the built cube without rebuilding the other five', () => {
    const { state, gl } = makeGlSceneState();
    ensureGlEnvironmentSourceCube(state, dataOnlyEnvironment(4));
    const afterBuild = gl.calls.filter((c) => c.name === 'texImage2D').length;
    expect(afterBuild).toBe(6);
    expect(updateGlEnvironmentCubeFace(state, 2, dataFace(4))).toBe(true);
    expect(gl.calls.filter((c) => c.name === 'texImage2D').length).toBe(afterBuild + 1);
  });
});
