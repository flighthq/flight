import type { CubeTexture, Environment, ImageResource } from '@flighthq/types';

import { ensureWgpuEnvironmentSourceCube } from './wgpuEnvironmentCube';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

// The GPU upload + sampling is validated by the functional `env-skybox` / `env-ibl` captures (jsdom has no
// real WebGPU cube texture). These cover the CPU-side wiring: the six-face upload, the caching identity,
// and the "no complete cube" sentinel path callers depend on to no-op — mirroring scene-gl's cube test.

function completeEnvironment(): Environment {
  const face = { source: {} as CanvasImageSource, width: 4, height: 4 } as ImageResource;
  const cube = {
    colorSpace: 'srgb',
    faces: [face, face, face, face, face, face],
    sampler: {},
  } as unknown as CubeTexture;
  return { environment: cube, intensity: 1 } as Environment;
}

describe('ensureWgpuEnvironmentSourceCube', () => {
  it('returns null when the environment has no complete source cube', () => {
    const { state } = makeWgpuSceneState();
    expect(ensureWgpuEnvironmentSourceCube(state, { environment: null, intensity: 1 } as Environment)).toBe(null);
  });

  it('uploads six faces into a cube texture and caches the view', () => {
    const { fake, state } = makeWgpuSceneState();
    const view = ensureWgpuEnvironmentSourceCube(state, completeEnvironment());
    expect(view).not.toBe(null);
    expect(fake.calls.filter((c) => c.name === 'copyExternalImageToTexture').length).toBe(6);
    expect(getWgpuSceneRuntime(state).environmentSourceCube).not.toBe(null);
  });

  it('re-uses the cached cube view without re-uploading', () => {
    const { fake, state } = makeWgpuSceneState();
    const view = ensureWgpuEnvironmentSourceCube(state, completeEnvironment());
    const uploads = fake.calls.filter((c) => c.name === 'copyExternalImageToTexture').length;
    const again = ensureWgpuEnvironmentSourceCube(state, completeEnvironment());
    expect(again).toBe(view);
    expect(fake.calls.filter((c) => c.name === 'copyExternalImageToTexture').length).toBe(uploads);
  });
});
