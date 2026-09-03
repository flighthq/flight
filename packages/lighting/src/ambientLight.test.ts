import { AmbientLightKind, LuxLightUnit, UnitlessLightUnit } from '@flighthq/types/contract';

import { cloneAmbientLight, createAmbientLight } from './ambientLight';

describe('cloneAmbientLight', () => {
  it('creates an independent copy with the same fields', () => {
    const light = createAmbientLight({
      color: 0x112233ff,
      enabled: false,
      intensity: 0.5,
      intensityUnit: LuxLightUnit,
    });
    const copy = cloneAmbientLight(light);
    expect(copy).not.toBe(light);
    expect(copy.color).toBe(0x112233ff);
    expect(copy.enabled).toBe(false);
    expect(copy.intensity).toBe(0.5);
    expect(copy.intensityUnit).toBe(LuxLightUnit);
    expect(copy.kind).toBe(AmbientLightKind);
  });
});

describe('createAmbientLight', () => {
  it('applies opaque-white defaults at unit intensity', () => {
    const light = createAmbientLight();
    expect(light.color).toBe(0xffffffff);
    expect(light.enabled).toBe(true);
    expect(light.intensity).toBe(1);
    expect(light.intensityUnit).toBe(UnitlessLightUnit);
    expect(light.kind).toBe(AmbientLightKind);
  });

  it('overrides color and intensity from options', () => {
    const light = createAmbientLight({ color: 0x00ff00ff, enabled: false, intensity: 2, intensityUnit: LuxLightUnit });
    expect(light.color).toBe(0x00ff00ff);
    expect(light.enabled).toBe(false);
    expect(light.intensity).toBe(2);
    expect(light.intensityUnit).toBe(LuxLightUnit);
  });
});
