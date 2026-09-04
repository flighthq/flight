import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createSheenPbrExtension, initializeSheenPbrExtension, isValidSheenPbrExtension } from './sheenPbrExtension';

describe('createSheenPbrExtension', () => {
  it('creates an Entity with independent color and roughness UV sets', () => {
    const value = createSheenPbrExtension({ sheenColorMapUvSet: 1 });
    expect(EntityRuntimeKey in value).toBe(true);
    expect(value.sheenColor).toBe(0x000000ff);
    expect(value.sheenColorMapUvSet).toBe(1);
    expect(value.sheenRoughnessMapUvSet).toBe(0);
  });
});

describe('initializeSheenPbrExtension', () => {
  it('is the construction initializer of createSheenPbrExtension', () => {
    expect(typeof initializeSheenPbrExtension).toBe('function');
  });
});
describe('isValidSheenPbrExtension', () => {
  it('rejects invalid roughness and UV selection', () => {
    expect(isValidSheenPbrExtension(createSheenPbrExtension({ sheenRoughness: 1 }))).toBe(true);
    expect(isValidSheenPbrExtension(createSheenPbrExtension({ sheenRoughness: NaN }))).toBe(false);
    const invalidUv = createSheenPbrExtension();
    Reflect.set(invalidUv, 'sheenRoughnessMapUvSet', -1);
    expect(isValidSheenPbrExtension(invalidUv)).toBe(false);
  });
});
