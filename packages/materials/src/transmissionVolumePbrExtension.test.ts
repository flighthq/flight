import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createTransmissionVolumePbrExtension,
  initializeTransmissionVolumePbrExtension,
  isValidTransmissionVolumePbrExtension,
} from './transmissionVolumePbrExtension';

describe('createTransmissionVolumePbrExtension', () => {
  it('creates an Entity with glTF defaults and independent UV sets', () => {
    const value = createTransmissionVolumePbrExtension({ transmissionMapUvSet: 1 });
    expect(EntityRuntimeKey in value).toBe(true);
    expect(value.attenuationDistance).toBe(Infinity);
    expect(value.ior).toBe(1.5);
    expect(value.transmissionMapUvSet).toBe(1);
    expect(value.thicknessMapUvSet).toBe(0);
  });
});

describe('initializeTransmissionVolumePbrExtension', () => {
  it('is the construction initializer of createTransmissionVolumePbrExtension', () => {
    expect(typeof initializeTransmissionVolumePbrExtension).toBe('function');
  });
});
describe('isValidTransmissionVolumePbrExtension', () => {
  it('accepts infinite attenuation and rejects invalid transport relationships or UV sets', () => {
    expect(isValidTransmissionVolumePbrExtension(createTransmissionVolumePbrExtension())).toBe(true);
    expect(
      isValidTransmissionVolumePbrExtension(createTransmissionVolumePbrExtension({ attenuationDistance: 0 })),
    ).toBe(false);
    expect(isValidTransmissionVolumePbrExtension(createTransmissionVolumePbrExtension({ ior: 0.5 }))).toBe(false);
    expect(isValidTransmissionVolumePbrExtension(createTransmissionVolumePbrExtension({ thickness: -1 }))).toBe(false);
    const invalidUv = createTransmissionVolumePbrExtension();
    Reflect.set(invalidUv, 'thicknessMapUvSet', 2);
    expect(isValidTransmissionVolumePbrExtension(invalidUv)).toBe(false);
  });
});
