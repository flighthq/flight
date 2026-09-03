import type { Bitmap, Environment, ImageResource, Texture } from '@flighthq/types/contract';
import { BitmapTextureSourceKind, ImageTextureSourceKind } from '@flighthq/types/contract';

import { ensureWgpuEnvironmentSourceCube, updateWgpuEnvironmentCubeFace } from './wgpuEnvironmentCube';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';

// The GPU upload + sampling is validated by the functional `env-skybox` / `env-ibl` captures (jsdom has no
// real WebGPU cube texture). These cover the CPU-side wiring: the six-face upload, the caching identity,
// and the "no complete cube" sentinel path callers depend on to no-op — mirroring scene-gl's cube test.

function completeEnvironment(): Environment {
  const source = document.createElement('canvas');
  source.width = 4;
  source.height = 4;
  const face = {
    height: 4,
    kind: ImageTextureSourceKind,
    source,
    width: 4,
  } as unknown as ImageResource;
  const cube = {
    colorSpace: 'srgb',
    sampler: {},
    dimension: 'cube',
    sources: [face, face, face, face, face, face],
  } as unknown as Texture;
  return { environment: cube, intensity: 1 } as Environment;
}

function dataFace(): Bitmap {
  return {
    data: new Uint8ClampedArray(4 * 4 * 4),
    height: 4,
    kind: BitmapTextureSourceKind,
    width: 4,
  } as Bitmap;
}

function dataOnlyEnvironment(): Environment {
  const face = dataFace();
  const cube = {
    colorSpace: 'srgb',
    sampler: {},
    dimension: 'cube',
    sources: [face, face, face, face, face, face],
  } as unknown as Texture;
  return { environment: cube, intensity: 1 } as Environment;
}

describe('ensureWgpuEnvironmentSourceCube', () => {
  it('returns null when the environment has no complete source cube', () => {
    const { state } = makeWgpuScene3DState();
    expect(ensureWgpuEnvironmentSourceCube(state, { environment: null, intensity: 1 } as Environment)).toBe(null);
  });

  it('uploads six faces into a cube texture and caches the view', () => {
    const { fake, state } = makeWgpuScene3DState();
    const view = ensureWgpuEnvironmentSourceCube(state, completeEnvironment());
    expect(view).not.toBe(null);
    expect(fake.calls.find((c) => c.name === 'createTexture')?.args[0]).toEqual(
      expect.objectContaining({ format: 'rgba8unorm-srgb' }),
    );
    expect(fake.calls.filter((c) => c.name === 'copyExternalImageToTexture').length).toBe(6);
    expect(getWgpuScene3DRuntime(state).environmentSourceCube).not.toBe(null);
  });

  it('uploads a data-only cube through queue.writeTexture', () => {
    const { fake, state } = makeWgpuScene3DState();
    const view = ensureWgpuEnvironmentSourceCube(state, dataOnlyEnvironment());
    expect(view).not.toBe(null);
    const writes = fake.calls.filter((c) => c.name === 'writeTexture');
    expect(writes.length).toBe(6);
    expect(fake.calls.filter((c) => c.name === 'copyExternalImageToTexture').length).toBe(0);
    // rgba8 data face: tightly-packed rows of width*4 bytes.
    expect((writes[0].args[2] as { bytesPerRow: number }).bytesPerRow).toBe(16);
    expect(writes[0].args[1]).toBeInstanceOf(Uint8ClampedArray);
  });

  it('uses a linear GPU format for a linear source cube', () => {
    const { fake, state } = makeWgpuScene3DState();
    const environment = dataOnlyEnvironment();
    environment.environment!.colorSpace = 'linear';
    ensureWgpuEnvironmentSourceCube(state, environment);
    expect(fake.calls.find((c) => c.name === 'createTexture')?.args[0]).toEqual(
      expect.objectContaining({ format: 'rgba8unorm' }),
    );
  });

  it('re-uses the cached cube view without re-uploading', () => {
    const { fake, state } = makeWgpuScene3DState();
    const view = ensureWgpuEnvironmentSourceCube(state, completeEnvironment());
    const uploads = fake.calls.filter((c) => c.name === 'copyExternalImageToTexture').length;
    const again = ensureWgpuEnvironmentSourceCube(state, completeEnvironment());
    expect(again).toBe(view);
    expect(fake.calls.filter((c) => c.name === 'copyExternalImageToTexture').length).toBe(uploads);
  });
});

describe('updateWgpuEnvironmentCubeFace', () => {
  it('returns false when no source cube has been built yet', () => {
    const { fake, state } = makeWgpuScene3DState();
    expect(updateWgpuEnvironmentCubeFace(state, 2, dataFace())).toBe(false);
    expect(fake.calls.some((c) => c.name === 'writeTexture')).toBe(false);
  });

  it('restamps a single face of the built cube without rebuilding the other five', () => {
    const { fake, state } = makeWgpuScene3DState();
    ensureWgpuEnvironmentSourceCube(state, dataOnlyEnvironment());
    const afterBuild = fake.calls.filter((c) => c.name === 'writeTexture').length;
    expect(afterBuild).toBe(6);
    expect(updateWgpuEnvironmentCubeFace(state, 2, dataFace())).toBe(true);
    expect(fake.calls.filter((c) => c.name === 'writeTexture').length).toBe(afterBuild + 1);
  });
});
