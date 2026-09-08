import type { LightUnit, PhotometricLightLike } from '@flighthq/types/contract';
import { CandelaLightUnit, LumenLightUnit, LuxLightUnit, UnitlessLightUnit } from '@flighthq/types/contract';

import {
  applyLightExposure,
  convertLightIntensity,
  getLightLinearIntensity,
  getLightPhotometricIntensity,
  setLightPhotometricIntensity,
} from './lightIntensity';

describe('applyLightExposure', () => {
  it('returns the intensity unchanged at 0 EV', () => {
    expect(applyLightExposure(1, 0)).toBe(1);
    expect(applyLightExposure(3.5, 0)).toBe(3.5);
  });

  it('doubles per +1 EV stop', () => {
    expect(applyLightExposure(1, 1)).toBe(2);
    expect(applyLightExposure(1, 3)).toBe(8);
    expect(applyLightExposure(2, 2)).toBe(8);
  });

  it('halves per -1 EV stop', () => {
    expect(applyLightExposure(1, -1)).toBe(0.5);
    expect(applyLightExposure(8, -3)).toBe(1);
  });

  it('accepts fractional stops', () => {
    expect(applyLightExposure(1, 0.5)).toBeCloseTo(Math.SQRT2, 10);
  });

  it('is symmetric: +ev then -ev round-trips', () => {
    const boosted = applyLightExposure(1.7, 2.5);
    expect(applyLightExposure(boosted, -2.5)).toBeCloseTo(1.7, 10);
  });
});

describe('convertLightIntensity', () => {
  it('is identity when fromUnit equals toUnit', () => {
    expect(convertLightIntensity(LuxLightUnit, LuxLightUnit, 500)).toBeCloseTo(500, 10);
    expect(convertLightIntensity(CandelaLightUnit, CandelaLightUnit, 42)).toBeCloseTo(42, 10);
  });

  it('round-trips through an intermediate unit', () => {
    const asCandela = convertLightIntensity(LuxLightUnit, CandelaLightUnit, 1234);
    expect(convertLightIntensity(CandelaLightUnit, LuxLightUnit, asCandela)).toBeCloseTo(1234, 6);
  });

  it('maps Lux and Candela identically (shared anchor)', () => {
    expect(convertLightIntensity(LuxLightUnit, CandelaLightUnit, 777)).toBeCloseTo(777, 10);
  });

  it('relates Lumen and Candela by the isotropic 4*PI factor', () => {
    // A candela over the full sphere is 4*PI lumens.
    expect(convertLightIntensity(CandelaLightUnit, LumenLightUnit, 1)).toBeCloseTo(4 * Math.PI, 10);
  });

  it('agrees with getLightLinearIntensity for the Unitless target', () => {
    expect(convertLightIntensity(CandelaLightUnit, UnitlessLightUnit, 50000)).toBeCloseTo(
      getLightLinearIntensity(CandelaLightUnit, 50000),
      10,
    );
  });
});

describe('getLightLinearIntensity', () => {
  it('passes Unitless through 1:1', () => {
    expect(getLightLinearIntensity(UnitlessLightUnit, 1)).toBe(1);
    expect(getLightLinearIntensity(UnitlessLightUnit, 6.25)).toBe(6.25);
  });

  it('anchors 100000 lux to linear 1.0', () => {
    expect(getLightLinearIntensity(LuxLightUnit, 100000)).toBeCloseTo(1, 10);
  });

  it('anchors 100000 candela to linear 1.0', () => {
    expect(getLightLinearIntensity(CandelaLightUnit, 100000)).toBeCloseTo(1, 10);
  });

  it('scales linearly with the value', () => {
    expect(getLightLinearIntensity(LuxLightUnit, 50000)).toBeCloseTo(0.5, 10);
  });

  it('treats one lumen as 1 / (4*PI) of a candela contribution', () => {
    const perCandela = getLightLinearIntensity(CandelaLightUnit, 1);
    const perLumen = getLightLinearIntensity(LumenLightUnit, 1);
    expect(perLumen).toBeCloseTo(perCandela / (4 * Math.PI), 12);
  });
});

describe('getLightPhotometricIntensity', () => {
  it('reads a light back in the unit it declares', () => {
    // 100000 lux is the anchor for linear 1.0, so a sun at linear 1 reads back as 100000 lux. This is
    // the connection the unit field previously did not have to the light carrying it.
    const sun: PhotometricLightLike = { intensity: 1, intensityUnit: LuxLightUnit };
    expect(getLightPhotometricIntensity(sun)).toBeCloseTo(100000, 6);
  });

  it('passes a Unitless light through, because linear IS its authored reading', () => {
    const plain: PhotometricLightLike = { intensity: 2.5, intensityUnit: UnitlessLightUnit };
    expect(getLightPhotometricIntensity(plain)).toBe(2.5);
  });

  it('reads candela and lumen through their own anchors, not through lux', () => {
    const point: PhotometricLightLike = { intensity: 1, intensityUnit: CandelaLightUnit };
    const flux: PhotometricLightLike = { intensity: 1, intensityUnit: LumenLightUnit };
    expect(getLightPhotometricIntensity(point)).toBeCloseTo(100000, 6);
    // A lumen is 1/(4*PI) of a candela's contribution, so linear 1 is 4*PI times as many lumens.
    expect(getLightPhotometricIntensity(flux)).toBeCloseTo(100000 * 4 * Math.PI, 3);
  });
});

describe('setLightPhotometricIntensity', () => {
  it('stores the dimensionless multiplier, keeping units out of the render path', () => {
    const sun: PhotometricLightLike = { intensity: 0, intensityUnit: LuxLightUnit };
    setLightPhotometricIntensity(sun, 100000);
    expect(sun.intensity).toBeCloseTo(1, 6);
    // The unit is not consumed by the write — it selects the conversion and stays as authored.
    expect(sun.intensityUnit).toBe(LuxLightUnit);
  });

  it('round-trips with the getter for every unit', () => {
    const units: LightUnit[] = [UnitlessLightUnit, LuxLightUnit, CandelaLightUnit, LumenLightUnit];
    for (const unit of units) {
      const light: PhotometricLightLike = { intensity: 0, intensityUnit: unit };
      setLightPhotometricIntensity(light, 1234.5);
      expect(getLightPhotometricIntensity(light)).toBeCloseTo(1234.5, 6);
    }
  });
});
