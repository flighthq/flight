import { HemisphereLightKind } from '@flighthq/types';

import { cloneHemisphereLight, createHemisphereLight } from './hemisphereLight';

describe('cloneHemisphereLight', () => {
  it('creates an independent copy with the same fields', () => {
    const light = createHemisphereLight({ groundColor: 0x223344ff, intensity: 0.5, skyColor: 0x8899aaff });
    const copy = cloneHemisphereLight(light);
    expect(copy).not.toBe(light);
    expect(copy.groundColor).toBe(0x223344ff);
    expect(copy.intensity).toBe(0.5);
    expect(copy.skyColor).toBe(0x8899aaff);
    expect(copy.kind).toBe(HemisphereLightKind);
  });
});

describe('createHemisphereLight', () => {
  it('applies opaque-white defaults at unit intensity for both colors', () => {
    const light = createHemisphereLight();
    expect(light.groundColor).toBe(0xffffffff);
    expect(light.intensity).toBe(1);
    expect(light.skyColor).toBe(0xffffffff);
    expect(light.kind).toBe(HemisphereLightKind);
  });

  it('overrides sky and ground colors from options', () => {
    const light = createHemisphereLight({ groundColor: 0x000000ff, skyColor: 0x0000ffff });
    expect(light.groundColor).toBe(0x000000ff);
    expect(light.skyColor).toBe(0x0000ffff);
  });
});
