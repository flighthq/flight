import { createVector3 } from '@flighthq/geometry';
import { SpotLightKind } from '@flighthq/types';

import { cloneSpotLight, createSpotLight, setSpotLightCone } from './spotLight';

describe('cloneSpotLight', () => {
  it('creates an independent copy with fresh position and direction vectors', () => {
    const light = createSpotLight({
      castsShadow: true,
      color: 0x112233ff,
      direction: createVector3(1, 0, 0),
      innerConeDegrees: 10,
      intensity: 0.5,
      normalBias: 0.1,
      outerConeDegrees: 30,
      pcfRadius: 2,
      position: createVector3(3, 4, 5),
      range: 10,
      shadowBias: 0.01,
    });
    const copy = cloneSpotLight(light);
    expect(copy).not.toBe(light);
    expect(copy.position).not.toBe(light.position);
    expect(copy.direction).not.toBe(light.direction);
    expect(copy.castsShadow).toBe(true);
    expect(copy.color).toBe(0x112233ff);
    expect(copy.direction.x).toBe(1);
    expect(copy.innerConeCos).toBe(light.innerConeCos);
    expect(copy.intensity).toBe(0.5);
    expect(copy.normalBias).toBe(0.1);
    expect(copy.outerConeCos).toBe(light.outerConeCos);
    expect(copy.pcfRadius).toBe(2);
    expect(copy.position.z).toBe(5);
    expect(copy.range).toBe(10);
    expect(copy.shadowBias).toBe(0.01);
    expect(copy.kind).toBe(SpotLightKind);
  });
});

describe('createSpotLight', () => {
  it('applies defaults: white, unit intensity, origin facing down, 0/45 cone, infinite range', () => {
    const light = createSpotLight();
    expect(light.castsShadow).toBe(false);
    expect(light.color).toBe(0xffffffff);
    expect(light.direction.y).toBe(-1);
    expect(light.innerConeCos).toBeCloseTo(1, 6);
    expect(light.intensity).toBe(1);
    expect(light.normalBias).toBe(0);
    expect(light.outerConeCos).toBeCloseTo(Math.cos((45 * Math.PI) / 180), 6);
    expect(light.pcfRadius).toBe(0);
    expect(light.position.x).toBe(0);
    expect(light.range).toBe(-1);
    expect(light.shadowBias).toBe(0);
    expect(light.kind).toBe(SpotLightKind);
  });

  it('precomputes cone cosines from inner/outer degrees with innerConeCos >= outerConeCos', () => {
    const light = createSpotLight({ innerConeDegrees: 20, outerConeDegrees: 40 });
    expect(light.innerConeCos).toBeCloseTo(Math.cos((20 * Math.PI) / 180), 6);
    expect(light.outerConeCos).toBeCloseTo(Math.cos((40 * Math.PI) / 180), 6);
    expect(light.innerConeCos).toBeGreaterThanOrEqual(light.outerConeCos);
  });

  it('copies supplied position and direction rather than aliasing them', () => {
    const position = createVector3(1, 2, 3);
    const direction = createVector3(0, 0, 1);
    const light = createSpotLight({ direction, position });
    expect(light.position).not.toBe(position);
    expect(light.direction).not.toBe(direction);
  });
});

describe('setSpotLightCone', () => {
  it('writes the cosines of the inner and outer half-angles into the light', () => {
    const light = createSpotLight();
    setSpotLightCone(light, 15, 35);
    expect(light.innerConeCos).toBeCloseTo(Math.cos((15 * Math.PI) / 180), 6);
    expect(light.outerConeCos).toBeCloseTo(Math.cos((35 * Math.PI) / 180), 6);
  });

  it('produces equal cosines when inner and outer angles match', () => {
    const light = createSpotLight();
    setSpotLightCone(light, 25, 25);
    expect(light.innerConeCos).toBeCloseTo(light.outerConeCos, 6);
  });
});
