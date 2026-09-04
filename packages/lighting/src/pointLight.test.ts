import { createVector3 } from '@flighthq/geometry/contract';
import { CandelaLightUnit, PointLightKind, UnitlessLightUnit } from '@flighthq/types/contract';

import { clonePointLight, createPointLight, initializePointLight } from './pointLight';

describe('clonePointLight', () => {
  it('creates an independent copy with a fresh position vector', () => {
    const light = createPointLight({
      castsShadow: true,
      color: 0x112233ff,
      decay: 1.5,
      enabled: false,
      intensity: 0.5,
      intensityUnit: CandelaLightUnit,
      normalBias: 0.1,
      pcfRadius: 2,
      position: createVector3(3, 4, 5),
      range: 10,
      shadowBias: 0.01,
      shadowFar: 300,
      shadowMapSize: 2048,
      shadowNear: 0.25,
      shadowStrength: 0.75,
    });
    const copy = clonePointLight(light);
    expect(copy).not.toBe(light);
    expect(copy.position).not.toBe(light.position);
    expect(copy.castsShadow).toBe(true);
    expect(copy.color).toBe(0x112233ff);
    expect(copy.decay).toBe(1.5);
    expect(copy.enabled).toBe(false);
    expect(copy.intensity).toBe(0.5);
    expect(copy.intensityUnit).toBe(CandelaLightUnit);
    expect(copy.normalBias).toBe(0.1);
    expect(copy.pcfRadius).toBe(2);
    expect(copy.position.x).toBe(3);
    expect(copy.range).toBe(10);
    expect(copy.shadowBias).toBe(0.01);
    expect(copy.shadowFar).toBe(300);
    expect(copy.shadowMapSize).toBe(2048);
    expect(copy.shadowNear).toBe(0.25);
    expect(copy.shadowStrength).toBe(0.75);
    expect(copy.kind).toBe(PointLightKind);
  });
});

describe('createPointLight', () => {
  it('applies defaults: white, unit intensity, origin, infinite range, shadows off', () => {
    const light = createPointLight();
    expect(light.castsShadow).toBe(false);
    expect(light.color).toBe(0xffffffff);
    expect(light.decay).toBe(2);
    expect(light.enabled).toBe(true);
    expect(light.intensity).toBe(1);
    expect(light.intensityUnit).toBe(UnitlessLightUnit);
    expect(light.normalBias).toBe(0);
    expect(light.pcfRadius).toBe(0);
    expect(light.position.x).toBe(0);
    expect(light.position.y).toBe(0);
    expect(light.position.z).toBe(0);
    expect(light.range).toBe(-1);
    expect(light.shadowBias).toBe(0);
    expect(light.shadowFar).toBe(500);
    expect(light.shadowMapSize).toBe(1024);
    expect(light.shadowNear).toBe(0.5);
    expect(light.shadowStrength).toBe(1);
    expect(light.kind).toBe(PointLightKind);
  });

  it('copies the supplied position rather than aliasing it', () => {
    const position = createVector3(1, 2, 3);
    const light = createPointLight({ position });
    expect(light.position).not.toBe(position);
    expect(light.position.y).toBe(2);
  });
});
describe('initializePointLight', () => {
  it('is the construction initializer of createPointLight', () => {
    expect(typeof initializePointLight).toBe('function');
  });
});
