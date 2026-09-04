import { createVector3 } from '@flighthq/geometry/contract';
import { DirectionalLightKind, LuxLightUnit, UnitlessLightUnit } from '@flighthq/types/contract';

import {
  cloneDirectionalLight,
  createDirectionalLight,
  initializeDirectionalLight,
  setDirectionalLightDirection,
  setDirectionalLightTarget,
} from './directionalLight';

describe('cloneDirectionalLight', () => {
  it('creates an independent copy with a fresh direction vector', () => {
    const light = createDirectionalLight({
      cascadeCount: 2,
      cascadeSplits: [0.25, 1],
      castsShadow: true,
      color: 0x112233ff,
      direction: createVector3(1, 0, 0),
      enabled: false,
      intensity: 0.5,
      intensityUnit: LuxLightUnit,
      normalBias: 0.1,
      pcfRadius: 2,
      shadowBias: 0.01,
      shadowFar: 300,
      shadowMapSize: 2048,
      shadowNear: 0.25,
      shadowStrength: 0.75,
    });
    const copy = cloneDirectionalLight(light);
    expect(copy).not.toBe(light);
    expect(copy.direction).not.toBe(light.direction);
    expect(copy.cascadeSplits).not.toBe(light.cascadeSplits);
    expect(copy.cascadeCount).toBe(2);
    expect(copy.cascadeSplits).toEqual([0.25, 1]);
    expect(copy.castsShadow).toBe(true);
    expect(copy.color).toBe(0x112233ff);
    expect(copy.direction.x).toBe(1);
    expect(copy.enabled).toBe(false);
    expect(copy.intensity).toBe(0.5);
    expect(copy.intensityUnit).toBe(LuxLightUnit);
    expect(copy.normalBias).toBe(0.1);
    expect(copy.pcfRadius).toBe(2);
    expect(copy.shadowBias).toBe(0.01);
    expect(copy.shadowFar).toBe(300);
    expect(copy.shadowMapSize).toBe(2048);
    expect(copy.shadowNear).toBe(0.25);
    expect(copy.shadowStrength).toBe(0.75);
    expect(copy.kind).toBe(DirectionalLightKind);
  });
});

describe('createDirectionalLight', () => {
  it('applies defaults: white, unit intensity, downward, shadows off', () => {
    const light = createDirectionalLight();
    expect(light.cascadeCount).toBe(1);
    expect(light.cascadeSplits).toEqual([1]);
    expect(light.castsShadow).toBe(false);
    expect(light.color).toBe(0xffffffff);
    expect(light.direction.x).toBe(0);
    expect(light.direction.y).toBe(-1);
    expect(light.direction.z).toBe(0);
    expect(light.enabled).toBe(true);
    expect(light.intensity).toBe(1);
    expect(light.intensityUnit).toBe(UnitlessLightUnit);
    expect(light.normalBias).toBe(0);
    expect(light.pcfRadius).toBe(0);
    expect(light.shadowBias).toBe(0);
    expect(light.shadowFar).toBe(500);
    expect(light.shadowMapSize).toBe(1024);
    expect(light.shadowNear).toBe(0.5);
    expect(light.shadowStrength).toBe(1);
    expect(light.kind).toBe(DirectionalLightKind);
  });

  it('copies the supplied direction rather than aliasing it', () => {
    const direction = createVector3(0, 0, 1);
    const light = createDirectionalLight({ direction });
    expect(light.direction).not.toBe(direction);
    expect(light.direction.z).toBe(1);
  });

  it('normalizes the supplied direction', () => {
    const light = createDirectionalLight({ direction: createVector3(0, 3, 4) });
    expect(light.direction.y).toBeCloseTo(0.6, 6);
    expect(light.direction.z).toBeCloseTo(0.8, 6);
  });

  it('keeps the downward default for a zero-length supplied direction', () => {
    const light = createDirectionalLight({ direction: createVector3(0, 0, 0) });
    expect(light.direction.x).toBe(0);
    expect(light.direction.y).toBe(-1);
    expect(light.direction.z).toBe(0);
  });
});

describe('initializeDirectionalLight', () => {
  it('is the construction initializer of createDirectionalLight', () => {
    expect(typeof initializeDirectionalLight).toBe('function');
  });
});

describe('setDirectionalLightDirection', () => {
  it('writes a normalized direction into the light', () => {
    const light = createDirectionalLight();
    setDirectionalLightDirection(light, 0, 0, 3);
    expect(light.direction.x).toBeCloseTo(0, 6);
    expect(light.direction.y).toBeCloseTo(0, 6);
    expect(light.direction.z).toBeCloseTo(1, 6);
  });

  it('leaves direction unchanged for a zero-length input', () => {
    const light = createDirectionalLight({ direction: createVector3(0, -1, 0) });
    setDirectionalLightDirection(light, 0, 0, 0);
    expect(light.direction.y).toBeCloseTo(-1, 6);
  });
});
describe('setDirectionalLightTarget', () => {
  it('sets direction toward the target from the from-point', () => {
    const light = createDirectionalLight();
    setDirectionalLightTarget(light, 0, 0, 0, 0, 0, 5);
    expect(light.direction.x).toBeCloseTo(0, 6);
    expect(light.direction.y).toBeCloseTo(0, 6);
    expect(light.direction.z).toBeCloseTo(1, 6);
  });

  it('leaves direction unchanged when from equals to', () => {
    const light = createDirectionalLight({ direction: createVector3(0, -1, 0) });
    setDirectionalLightTarget(light, 1, 2, 3, 1, 2, 3);
    expect(light.direction.y).toBeCloseTo(-1, 6);
  });
});
