import { createVector3 } from '@flighthq/geometry/contract';
import { CandelaLightUnit, SpotLightKind, UnitlessLightUnit } from '@flighthq/types/contract';

import {
  cloneSpotLight,
  createSpotLight,
  getSpotLightConeDegrees,
  initializeSpotLight,
  setSpotLightBlend,
  setSpotLightCone,
  setSpotLightDirection,
  setSpotLightTarget,
} from './spotLight';

describe('cloneSpotLight', () => {
  it('creates an independent copy with fresh position and direction vectors', () => {
    const light = createSpotLight({
      castsShadow: true,
      color: 0x112233ff,
      decay: 1.5,
      direction: createVector3(1, 0, 0),
      enabled: false,
      innerConeDegrees: 10,
      intensity: 0.5,
      intensityUnit: CandelaLightUnit,
      normalBias: 0.1,
      outerConeDegrees: 30,
      pcfRadius: 2,
      position: createVector3(3, 4, 5),
      range: 10,
      shadowBias: 0.01,
      shadowFar: 300,
      shadowMapSize: 2048,
      shadowNear: 0.25,
      shadowStrength: 0.75,
      spotBlend: 0.6,
    });
    const copy = cloneSpotLight(light);
    expect(copy).not.toBe(light);
    expect(copy.position).not.toBe(light.position);
    expect(copy.direction).not.toBe(light.direction);
    expect(copy.castsShadow).toBe(true);
    expect(copy.color).toBe(0x112233ff);
    expect(copy.decay).toBe(1.5);
    expect(copy.direction.x).toBe(1);
    expect(copy.enabled).toBe(false);
    expect(copy.innerConeCos).toBe(light.innerConeCos);
    expect(copy.intensity).toBe(0.5);
    expect(copy.intensityUnit).toBe(CandelaLightUnit);
    expect(copy.normalBias).toBe(0.1);
    expect(copy.outerConeCos).toBe(light.outerConeCos);
    expect(copy.pcfRadius).toBe(2);
    expect(copy.position.z).toBe(5);
    expect(copy.range).toBe(10);
    expect(copy.shadowBias).toBe(0.01);
    expect(copy.shadowFar).toBe(300);
    expect(copy.shadowMapSize).toBe(2048);
    expect(copy.shadowNear).toBe(0.25);
    expect(copy.shadowStrength).toBe(0.75);
    expect(copy.spotBlend).toBe(0.6);
    expect(copy.kind).toBe(SpotLightKind);
  });
});

describe('createSpotLight', () => {
  it('applies defaults: white, unit intensity, origin facing down, 0/45 cone, infinite range', () => {
    const light = createSpotLight();
    expect(light.castsShadow).toBe(false);
    expect(light.color).toBe(0xffffffff);
    expect(light.decay).toBe(2);
    expect(light.direction.y).toBe(-1);
    expect(light.enabled).toBe(true);
    expect(light.innerConeCos).toBeCloseTo(1, 6);
    expect(light.intensity).toBe(1);
    expect(light.intensityUnit).toBe(UnitlessLightUnit);
    expect(light.normalBias).toBe(0);
    expect(light.outerConeCos).toBeCloseTo(Math.cos((45 * Math.PI) / 180), 6);
    expect(light.pcfRadius).toBe(0);
    expect(light.position.x).toBe(0);
    expect(light.range).toBe(-1);
    expect(light.shadowBias).toBe(0);
    expect(light.shadowFar).toBe(500);
    expect(light.shadowMapSize).toBe(1024);
    expect(light.shadowNear).toBe(0.5);
    expect(light.shadowStrength).toBe(1);
    expect(light.spotBlend).toBe(0);
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

  it('clamps a supplied blend through the public setter path', () => {
    expect(createSpotLight({ spotBlend: -1 }).spotBlend).toBe(0);
    expect(createSpotLight({ spotBlend: 2 }).spotBlend).toBe(1);
  });
});

describe('getSpotLightConeDegrees', () => {
  it('round-trips inner and outer degrees through create → get', () => {
    const light = createSpotLight({ innerConeDegrees: 15, outerConeDegrees: 35 });
    const angles = { innerDegrees: 0, outerDegrees: 0 };
    getSpotLightConeDegrees(angles, light);
    expect(angles.innerDegrees).toBeCloseTo(15, 4);
    expect(angles.outerDegrees).toBeCloseTo(35, 4);
  });

  it('writes into the provided out object', () => {
    const light = createSpotLight({ innerConeDegrees: 0, outerConeDegrees: 45 });
    const out = { innerDegrees: -1, outerDegrees: -1 };
    getSpotLightConeDegrees(out, light);
    expect(out.innerDegrees).toBeCloseTo(0, 4);
    expect(out.outerDegrees).toBeCloseTo(45, 4);
  });
});

describe('initializeSpotLight', () => {
  it('is the construction initializer of createSpotLight', () => {
    expect(typeof initializeSpotLight).toBe('function');
  });
});

describe('setSpotLightBlend', () => {
  it('stores a blend within the normalized range', () => {
    const light = createSpotLight();
    setSpotLightBlend(light, 0.4);
    expect(light.spotBlend).toBe(0.4);
  });

  it('clamps values to the normalized range', () => {
    const light = createSpotLight();
    setSpotLightBlend(light, -1);
    expect(light.spotBlend).toBe(0);
    setSpotLightBlend(light, 2);
    expect(light.spotBlend).toBe(1);
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

describe('setSpotLightDirection', () => {
  it('writes a normalized direction into the light', () => {
    const light = createSpotLight();
    setSpotLightDirection(light, 0, 2, 0);
    expect(light.direction.x).toBeCloseTo(0, 6);
    expect(light.direction.y).toBeCloseTo(1, 6);
    expect(light.direction.z).toBeCloseTo(0, 6);
  });

  it('leaves direction unchanged for a zero-length input', () => {
    const light = createSpotLight({ direction: createVector3(0, -1, 0) });
    setSpotLightDirection(light, 0, 0, 0);
    expect(light.direction.y).toBeCloseTo(-1, 6);
  });
});
describe('setSpotLightTarget', () => {
  it('sets direction from position toward target', () => {
    const light = createSpotLight({ position: createVector3(0, 0, 0) });
    setSpotLightTarget(light, 0, 0, 5);
    expect(light.direction.x).toBeCloseTo(0, 6);
    expect(light.direction.y).toBeCloseTo(0, 6);
    expect(light.direction.z).toBeCloseTo(1, 6);
  });

  it('leaves direction unchanged when target equals position', () => {
    const light = createSpotLight({ direction: createVector3(0, -1, 0), position: createVector3(1, 2, 3) });
    setSpotLightTarget(light, 1, 2, 3);
    expect(light.direction.y).toBeCloseTo(-1, 6);
  });
});
