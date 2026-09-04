import { createVector3 } from '@flighthq/geometry/contract';
import { AreaLightKind, LumenLightUnit, UnitlessLightUnit } from '@flighthq/types/contract';

import { cloneAreaLight, createAreaLight, initializeAreaLight, setAreaLightOrientation } from './areaLight';

describe('cloneAreaLight', () => {
  it('creates an independent copy with fresh position/direction/right/up vectors', () => {
    const light = createAreaLight({
      castsShadow: true,
      color: 0x112233ff,
      decay: 1.5,
      direction: createVector3(0, 0, -1),
      enabled: false,
      intensity: 0.5,
      intensityUnit: LumenLightUnit,
      normalBias: 0.1,
      pcfRadius: 2,
      position: createVector3(1, 2, 3),
      range: 8,
      right: createVector3(2, 0, 0),
      shadowBias: 0.01,
      shadowFar: 300,
      shadowMapSize: 2048,
      shadowNear: 0.25,
      shadowStrength: 0.75,
      up: createVector3(0, 3, 0),
    });
    const copy = cloneAreaLight(light);
    expect(copy).not.toBe(light);
    expect(copy.position).not.toBe(light.position);
    expect(copy.direction).not.toBe(light.direction);
    expect(copy.right).not.toBe(light.right);
    expect(copy.up).not.toBe(light.up);
    expect(copy.castsShadow).toBe(true);
    expect(copy.color).toBe(0x112233ff);
    expect(copy.decay).toBe(1.5);
    expect(copy.direction.z).toBe(-1);
    expect(copy.intensity).toBe(0.5);
    expect(copy.enabled).toBe(false);
    expect(copy.intensityUnit).toBe(LumenLightUnit);
    expect(copy.normalBias).toBe(0.1);
    expect(copy.pcfRadius).toBe(2);
    expect(copy.position.y).toBe(2);
    expect(copy.range).toBe(8);
    expect(copy.right.x).toBe(2);
    expect(copy.shadowBias).toBe(0.01);
    expect(copy.shadowFar).toBe(300);
    expect(copy.shadowMapSize).toBe(2048);
    expect(copy.shadowNear).toBe(0.25);
    expect(copy.shadowStrength).toBe(0.75);
    expect(copy.up.y).toBe(3);
    expect(copy.kind).toBe(AreaLightKind);
  });
});

describe('createAreaLight', () => {
  it('applies defaults: white, unit intensity, origin facing down, unit half-extents', () => {
    const light = createAreaLight();
    expect(light.castsShadow).toBe(false);
    expect(light.color).toBe(0xffffffff);
    expect(light.decay).toBe(2);
    expect(light.direction.y).toBe(-1);
    expect(light.enabled).toBe(true);
    expect(light.intensity).toBe(1);
    expect(light.intensityUnit).toBe(UnitlessLightUnit);
    expect(light.normalBias).toBe(0);
    expect(light.pcfRadius).toBe(0);
    expect(light.position.x).toBe(0);
    expect(light.range).toBe(-1);
    expect(light.right.x).toBe(1);
    expect(light.shadowBias).toBe(0);
    expect(light.shadowFar).toBe(500);
    expect(light.shadowMapSize).toBe(1024);
    expect(light.shadowNear).toBe(0.5);
    expect(light.shadowStrength).toBe(1);
    expect(light.up.z).toBe(1);
    expect(light.kind).toBe(AreaLightKind);
  });

  it('copies the supplied vectors rather than aliasing them', () => {
    const right = createVector3(4, 0, 0);
    const up = createVector3(0, 0, 5);
    const light = createAreaLight({ right, up });
    expect(light.right).not.toBe(right);
    expect(light.up).not.toBe(up);
    expect(light.right.x).toBe(4);
    expect(light.up.z).toBe(5);
  });
});

describe('initializeAreaLight', () => {
  it('is the construction initializer of createAreaLight', () => {
    expect(typeof initializeAreaLight).toBe('function');
  });
});
describe('setAreaLightOrientation', () => {
  it('updates the direction, right, and up axes while preserving half-extent lengths', () => {
    // right has length 3, up has length 4 — half-extents should survive the orientation update.
    const light = createAreaLight({
      direction: createVector3(0, -1, 0),
      right: createVector3(3, 0, 0),
      up: createVector3(0, 0, 4),
    });
    setAreaLightOrientation(light, createVector3(0, 0, -1), createVector3(1, 0, 0), createVector3(0, 1, 0));
    // Direction should now point into -z.
    expect(light.direction.z).toBeCloseTo(-1, 6);
    // Right and up half-extent lengths should be preserved.
    const rightLen = Math.sqrt(light.right.x ** 2 + light.right.y ** 2 + light.right.z ** 2);
    const upLen = Math.sqrt(light.up.x ** 2 + light.up.y ** 2 + light.up.z ** 2);
    expect(rightLen).toBeCloseTo(3, 5);
    expect(upLen).toBeCloseTo(4, 5);
  });

  it('ignores zero-length input vectors', () => {
    const light = createAreaLight({
      direction: createVector3(0, -1, 0),
      right: createVector3(1, 0, 0),
      up: createVector3(0, 0, 1),
    });
    setAreaLightOrientation(light, createVector3(0, 0, 0), createVector3(0, 0, 0), createVector3(0, 0, 0));
    // All vectors unchanged when all inputs are zero.
    expect(light.direction.y).toBeCloseTo(-1, 6);
    expect(light.right.x).toBeCloseTo(1, 6);
    expect(light.up.z).toBeCloseTo(1, 6);
  });
});
