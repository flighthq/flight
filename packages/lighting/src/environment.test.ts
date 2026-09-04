import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createVector2 } from '@flighthq/geometry/contract';
import type { Texture, Sampler } from '@flighthq/types/contract';
import { EnvironmentKind } from '@flighthq/types/contract';

import { cloneEnvironment, createEnvironment } from './environment';

function createTestCubeTexture(): Texture {
  const sampler = allocateEntity<Texture>();
  sampler.anisotropy = 1;
  sampler.magFilter = 'linear';
  sampler.minFilter = 'linear';
  sampler.mipmaps = false;
  sampler.wrapU = 'clamp-to-edge';
  sampler.wrapV = 'clamp-to-edge';
  const out = allocateEntity<Texture>();
  out.colorSpace = 'linear';
  out.flipX = false;
  out.flipY = false;
  out.sampler = sampler;
  out.dimension = 'cube';
  out.sources = [null, null, null, null, null, null];
  out.uvOffset = createVector2();
  out.uvRotation = 0;
  out.uvScale = createVector2(1, 1);
  out.version = 0;
  return finishEntity(out);
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
