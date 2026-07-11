import type { CubeTexture, Environment, ImageResource } from '@flighthq/types';

import { bakeWgpuEnvironmentIbl, destroyWgpuSceneIbl } from './wgpuEnvironmentIblBake';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

// The GPU bake (irradiance / prefiltered specular / BRDF LUT) is validated by the functional `env-ibl`
// capture — jsdom cannot run WGSL. These cover the CPU-side wiring: the no-op sentinel, the split-sum set's
// formats + mip chain stored on the runtime, the bake WGSL compile, and the destroy teardown — mirroring
// scene-gl's bake test.

function completeEnvironment(): Environment {
  const face = { source: {} as CanvasImageSource, width: 4, height: 4 } as ImageResource;
  const cube = {
    colorSpace: 'srgb',
    faces: [face, face, face, face, face, face],
    sampler: {},
  } as unknown as CubeTexture;
  return { environment: cube, intensity: 1 } as Environment;
}

describe('bakeWgpuEnvironmentIbl', () => {
  it('is a no-op leaving runtime.ibl null when the environment has no source cube', () => {
    const { state } = makeWgpuSceneState();
    bakeWgpuEnvironmentIbl(state, { environment: null, intensity: 1 } as Environment);
    expect(getWgpuSceneRuntime(state).ibl).toBe(null);
  });

  it('bakes the split-sum set: rgba16float irradiance + prefiltered cubes + BRDF LUT with the mip chain', () => {
    const { fake, state } = makeWgpuSceneState();
    bakeWgpuEnvironmentIbl(state, completeEnvironment());

    const runtime = getWgpuSceneRuntime(state);
    expect(runtime.ibl).not.toBe(null);
    expect(runtime.ibl!.prefilteredMipCount).toBe(5);
    expect(runtime.ibl!.intensity).toBe(1);

    const bakeTextures = fake.calls.filter(
      (c) => c.name === 'createTexture' && (c.args[0] as GPUTextureDescriptor).format === 'rgba16float',
    );
    // irradiance cube + prefiltered cube + BRDF LUT.
    expect(bakeTextures.length).toBe(3);
    // The prefiltered cube declares the full roughness mip chain up front.
    expect(bakeTextures.some((c) => (c.args[0] as GPUTextureDescriptor).mipLevelCount === 5)).toBe(true);
    // The bake WGSL is compiled (GGX importance sampling for the prefiltered/BRDF passes).
    expect(
      fake.calls.some(
        (c) =>
          c.name === 'createShaderModule' &&
          String((c.args[0] as { code: string }).code).includes('importanceSampleGGX'),
      ),
    ).toBe(true);
  });
});

describe('destroyWgpuSceneIbl', () => {
  it('frees the baked textures + source cube and clears the runtime slots', () => {
    const { state } = makeWgpuSceneState();
    bakeWgpuEnvironmentIbl(state, completeEnvironment());

    const runtime = getWgpuSceneRuntime(state);
    let destroyed = 0;
    runtime.ibl!.brdfLut.destroy = () => void destroyed++;
    runtime.ibl!.irradianceCube.destroy = () => void destroyed++;
    runtime.ibl!.prefilteredCube.destroy = () => void destroyed++;

    destroyWgpuSceneIbl(state);
    expect(destroyed).toBe(3);
    expect(runtime.ibl).toBe(null);
    expect(runtime.environmentSourceCube).toBe(null);
    expect(runtime.environmentSourceCubeView).toBe(null);
  });

  it('is a safe no-op when no bake ran for the state', () => {
    const { state } = makeWgpuSceneState();
    expect(() => destroyWgpuSceneIbl(state)).not.toThrow();
    expect(() => destroyWgpuSceneIbl(state)).not.toThrow();
  });
});
