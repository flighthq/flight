import { createCamera3D } from '@flighthq/camera';
import type { Camera3D, CubeTexture, Environment, ImageResource } from '@flighthq/types';

import { drawWgpuEnvironmentSkybox } from './wgpuEnvironmentSkybox';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

// The skybox draw itself is validated by the functional `env-skybox` capture (jsdom cannot run WGSL). These
// cover the CPU-side wiring: the no-complete-cube sentinel no-op, and the pipeline/bind/draw call shape of
// the backdrop pass — mirroring scene-gl's skybox test.

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function completeEnvironment(): Environment {
  const face = { source: {} as CanvasImageSource, width: 4, height: 4 } as ImageResource;
  const cube = {
    colorSpace: 'srgb',
    faces: [face, face, face, face, face, face],
    sampler: {},
  } as unknown as CubeTexture;
  return { environment: cube, intensity: 1 } as Environment;
}

describe('drawWgpuEnvironmentSkybox', () => {
  it('is a no-op when the environment has no complete source cube', () => {
    const { fake, state } = makeWgpuSceneState();
    const before = fake.calls.length;
    expect(() =>
      drawWgpuEnvironmentSkybox(state, { environment: null, intensity: 1 } as Environment, makeCamera(), 1),
    ).not.toThrow();
    expect(fake.calls.length).toBe(before);
  });

  it('binds the cube + uniform and draws the fullscreen backdrop', () => {
    const { fake, state } = makeWgpuSceneState();
    drawWgpuEnvironmentSkybox(state, completeEnvironment(), makeCamera(), 1);

    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setBindGroup' && c.args[0] === 1)).toBe(true);
    expect(fake.calls.some((c) => c.name === 'draw' && c.args[0] === 3)).toBe(true);
  });

  it('compiles skybox WGSL that reconstructs the ray from the inverse view-projection', () => {
    const { fake, state } = makeWgpuSceneState();
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
