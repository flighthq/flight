import { createVector3 } from '@flighthq/geometry';
import { DirectionalLightKind } from '@flighthq/types';

import { cloneDirectionalLight, createDirectionalLight } from './directionalLight';

describe('cloneDirectionalLight', () => {
  it('creates an independent copy with a fresh direction vector', () => {
    const light = createDirectionalLight({
      castsShadow: true,
      color: 0x112233ff,
      direction: createVector3(1, 0, 0),
      intensity: 0.5,
      normalBias: 0.1,
      pcfRadius: 2,
      shadowBias: 0.01,
    });
    const copy = cloneDirectionalLight(light);
    expect(copy).not.toBe(light);
    expect(copy.direction).not.toBe(light.direction);
    expect(copy.castsShadow).toBe(true);
    expect(copy.color).toBe(0x112233ff);
    expect(copy.direction.x).toBe(1);
    expect(copy.intensity).toBe(0.5);
    expect(copy.normalBias).toBe(0.1);
    expect(copy.pcfRadius).toBe(2);
    expect(copy.shadowBias).toBe(0.01);
    expect(copy.kind).toBe(DirectionalLightKind);
  });
});

describe('createDirectionalLight', () => {
  it('applies defaults: white, unit intensity, downward, shadows off', () => {
    const light = createDirectionalLight();
    expect(light.castsShadow).toBe(false);
    expect(light.color).toBe(0xffffffff);
    expect(light.direction.x).toBe(0);
    expect(light.direction.y).toBe(-1);
    expect(light.direction.z).toBe(0);
    expect(light.intensity).toBe(1);
    expect(light.normalBias).toBe(0);
    expect(light.pcfRadius).toBe(0);
    expect(light.shadowBias).toBe(0);
    expect(light.kind).toBe(DirectionalLightKind);
  });

  it('copies the supplied direction rather than aliasing it', () => {
    const direction = createVector3(0, 0, 1);
    const light = createDirectionalLight({ direction });
    expect(light.direction).not.toBe(direction);
    expect(light.direction.z).toBe(1);
  });
});
