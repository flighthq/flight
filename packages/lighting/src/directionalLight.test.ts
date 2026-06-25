import { createVector3 } from '@flighthq/geometry';
import { DirectionalLightKind } from '@flighthq/types';

import {
  cloneDirectionalLight,
  createDirectionalLight,
  setDirectionalLightDirection,
  setDirectionalLightTarget,
} from './directionalLight';

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
