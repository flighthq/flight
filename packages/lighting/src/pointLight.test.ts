import { createVector3 } from '@flighthq/geometry';
import { PointLightKind } from '@flighthq/types';

import { clonePointLight, createPointLight } from './pointLight';

describe('clonePointLight', () => {
  it('creates an independent copy with a fresh position vector', () => {
    const light = createPointLight({
      castsShadow: true,
      color: 0x112233ff,
      intensity: 0.5,
      normalBias: 0.1,
      pcfRadius: 2,
      position: createVector3(3, 4, 5),
      range: 10,
      shadowBias: 0.01,
    });
    const copy = clonePointLight(light);
    expect(copy).not.toBe(light);
    expect(copy.position).not.toBe(light.position);
    expect(copy.castsShadow).toBe(true);
    expect(copy.color).toBe(0x112233ff);
    expect(copy.intensity).toBe(0.5);
    expect(copy.normalBias).toBe(0.1);
    expect(copy.pcfRadius).toBe(2);
    expect(copy.position.x).toBe(3);
    expect(copy.range).toBe(10);
    expect(copy.shadowBias).toBe(0.01);
    expect(copy.kind).toBe(PointLightKind);
  });
});

describe('createPointLight', () => {
  it('applies defaults: white, unit intensity, origin, infinite range, shadows off', () => {
    const light = createPointLight();
    expect(light.castsShadow).toBe(false);
    expect(light.color).toBe(0xffffffff);
    expect(light.intensity).toBe(1);
    expect(light.normalBias).toBe(0);
    expect(light.pcfRadius).toBe(0);
    expect(light.position.x).toBe(0);
    expect(light.position.y).toBe(0);
    expect(light.position.z).toBe(0);
    expect(light.range).toBe(-1);
    expect(light.shadowBias).toBe(0);
    expect(light.kind).toBe(PointLightKind);
  });

  it('copies the supplied position rather than aliasing it', () => {
    const position = createVector3(1, 2, 3);
    const light = createPointLight({ position });
    expect(light.position).not.toBe(position);
    expect(light.position.y).toBe(2);
  });
});
