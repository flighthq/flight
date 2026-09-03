import { createCamera3D } from '@flighthq/camera/contract';
import type { Camera3D, Environment, ImageResource, Texture } from '@flighthq/types/contract';
import { ImageTextureSourceKind } from '@flighthq/types/contract';

import { drawWgpuEnvironmentSkybox } from './wgpuEnvironmentSkybox';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';

// The skybox draw itself is validated by the functional `env-skybox` capture (jsdom cannot run WGSL). These
// cover the CPU-side wiring: the no-complete-cube sentinel no-op, and the pipeline/bind/draw call shape of
// the backdrop pass — mirroring scene-gl's skybox test.

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

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

describe('drawWgpuEnvironmentSkybox', () => {
  it('is a no-op when the environment has no complete source cube', () => {
    const { fake, state } = makeWgpuScene3DState();
    const before = fake.calls.length;
    expect(() =>
      drawWgpuEnvironmentSkybox(state, { environment: null, intensity: 1 } as Environment, makeCamera(), 1),
    ).not.toThrow();
    expect(fake.calls.length).toBe(before);
  });

  it('binds the cube + uniform and draws the fullscreen backdrop', () => {
    const { fake, state } = makeWgpuScene3DState();
    const camera = makeCamera();
    camera.inverseViewProjection.m[0] = 42;
    drawWgpuEnvironmentSkybox(state, completeEnvironment(), camera, 1);

    expect(camera.inverseViewProjection.m[0]).not.toBe(42);
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setBindGroup' && c.args[0] === 1)).toBe(true);
    expect(fake.calls.some((c) => c.name === 'draw' && c.args[0] === 3)).toBe(true);
  });

  it('compiles skybox WGSL that reconstructs the ray from the inverse view-projection', () => {
    const { fake, state } = makeWgpuScene3DState();
    drawWgpuEnvironmentSkybox(state, completeEnvironment(), makeCamera(), 1);

    const shader = fake.calls.find(
      (c) =>
        c.name === 'createShaderModule' &&
        String((c.args[0] as { code: string }).code).includes('inverseViewProjection'),
    );
    expect(shader).toBeDefined();
    expect(String((shader!.args[0] as { code: string }).code)).toContain('texture_cube<f32>');
  });
});
