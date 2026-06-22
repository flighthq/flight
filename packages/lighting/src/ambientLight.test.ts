import { AmbientLightKind } from '@flighthq/types';

import { cloneAmbientLight, createAmbientLight } from './ambientLight';

describe('cloneAmbientLight', () => {
  it('creates an independent copy with the same fields', () => {
    const light = createAmbientLight({ color: 0x112233ff, intensity: 0.5 });
    const copy = cloneAmbientLight(light);
    expect(copy).not.toBe(light);
    expect(copy.color).toBe(0x112233ff);
    expect(copy.intensity).toBe(0.5);
    expect(copy.kind).toBe(AmbientLightKind);
  });
});

describe('createAmbientLight', () => {
  it('applies opaque-white defaults at unit intensity', () => {
    const light = createAmbientLight();
    expect(light.color).toBe(0xffffffff);
    expect(light.intensity).toBe(1);
    expect(light.kind).toBe(AmbientLightKind);
  });

  it('overrides color and intensity from options', () => {
    const light = createAmbientLight({ color: 0x00ff00ff, intensity: 2 });
    expect(light.color).toBe(0x00ff00ff);
    expect(light.intensity).toBe(2);
  });
});
