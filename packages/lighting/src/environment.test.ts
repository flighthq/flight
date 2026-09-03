import { createEntity } from '@flighthq/entity/contract';
import { createVector2 } from '@flighthq/geometry/contract';
import type { Texture, Sampler } from '@flighthq/types/contract';
import { EnvironmentKind } from '@flighthq/types/contract';

import { cloneEnvironment, createEnvironment } from './environment';

function createTestCubeTexture(): Texture {
  const sampler: Sampler = createEntity({
    anisotropy: 1,
    magFilter: 'linear',
    minFilter: 'linear',
    mipmaps: false,
    wrapU: 'clamp-to-edge',
    wrapV: 'clamp-to-edge',
  });
  return createEntity({
    colorSpace: 'linear',
    flipX: false,
    flipY: false,
    sampler,
    dimension: 'cube',
    sources: [null, null, null, null, null, null],
    uvOffset: createVector2(),
    uvRotation: 0,
    uvScale: createVector2(1, 1),
    version: 0,
  });
}

describe('cloneEnvironment', () => {
  it('creates an independent copy that shares the cubemap reference', () => {
    const cube = createTestCubeTexture();
    const environment = createEnvironment({ enabled: false, environment: cube, intensity: 0.5 });
    const copy = cloneEnvironment(environment);
    expect(copy).not.toBe(environment);
    expect(copy.environment).toBe(cube);
    expect(copy.enabled).toBe(false);
    expect(copy.intensity).toBe(0.5);
    expect(copy.kind).toBe(EnvironmentKind);
  });
});

describe('createEnvironment', () => {
  it('applies defaults: no cubemap at unit intensity', () => {
    const environment = createEnvironment();
    expect(environment.environment).toBeNull();
    expect(environment.enabled).toBe(true);
    expect(environment.intensity).toBe(1);
    expect(environment.kind).toBe(EnvironmentKind);
  });

  it('stores the supplied cubemap and intensity', () => {
    const cube = createTestCubeTexture();
    const environment = createEnvironment({ enabled: false, environment: cube, intensity: 2 });
    expect(environment.enabled).toBe(false);
    expect(environment.environment).toBe(cube);
    expect(environment.intensity).toBe(2);
  });
});
