import { createVector3 } from '@flighthq/geometry';
import { AreaLightKind } from '@flighthq/types';

import { cloneAreaLight, createAreaLight } from './areaLight';

describe('cloneAreaLight', () => {
  it('creates an independent copy with fresh position/direction/right/up vectors', () => {
    const light = createAreaLight({
      castsShadow: true,
      color: 0x112233ff,
      direction: createVector3(0, 0, -1),
      intensity: 0.5,
      normalBias: 0.1,
      pcfRadius: 2,
      position: createVector3(1, 2, 3),
      range: 8,
      right: createVector3(2, 0, 0),
      shadowBias: 0.01,
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
    expect(copy.direction.z).toBe(-1);
    expect(copy.intensity).toBe(0.5);
    expect(copy.normalBias).toBe(0.1);
    expect(copy.pcfRadius).toBe(2);
    expect(copy.position.y).toBe(2);
    expect(copy.range).toBe(8);
    expect(copy.right.x).toBe(2);
    expect(copy.shadowBias).toBe(0.01);
    expect(copy.up.y).toBe(3);
    expect(copy.kind).toBe(AreaLightKind);
  });
});

describe('createAreaLight', () => {
  it('applies defaults: white, unit intensity, origin facing down, unit half-extents', () => {
    const light = createAreaLight();
    expect(light.castsShadow).toBe(false);
    expect(light.color).toBe(0xffffffff);
    expect(light.direction.y).toBe(-1);
    expect(light.intensity).toBe(1);
    expect(light.normalBias).toBe(0);
    expect(light.pcfRadius).toBe(0);
    expect(light.position.x).toBe(0);
    expect(light.range).toBe(-1);
    expect(light.right.x).toBe(1);
    expect(light.shadowBias).toBe(0);
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
