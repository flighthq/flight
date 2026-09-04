import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createClearcoatPbrExtension,
  initializeClearcoatPbrExtension,
  isValidClearcoatPbrExtension,
} from './clearcoatPbrExtension';

describe('createClearcoatPbrExtension', () => {
  it('creates an Entity with an explicit normal scale and independent UV sets', () => {
    const value = createClearcoatPbrExtension({ clearcoatNormalMapUvSet: 1 });
    expect(EntityRuntimeKey in value).toBe(true);
    expect(value.clearcoatNormalScale).toBe(1);
    expect(value.clearcoatMapUvSet).toBe(0);
    expect(value.clearcoatNormalMapUvSet).toBe(1);
  });
});

describe('initializeClearcoatPbrExtension', () => {
  it('is the construction initializer of createClearcoatPbrExtension', () => {
    expect(typeof initializeClearcoatPbrExtension).toBe('function');
  });
});
describe('isValidClearcoatPbrExtension', () => {
  it('rejects invalid weights, normal scale, and map UV sets', () => {
    expect(isValidClearcoatPbrExtension(createClearcoatPbrExtension())).toBe(true);
    expect(isValidClearcoatPbrExtension(createClearcoatPbrExtension({ clearcoat: 2 }))).toBe(false);
    expect(isValidClearcoatPbrExtension(createClearcoatPbrExtension({ clearcoatNormalScale: -1 }))).toBe(false);
    const invalidUv = createClearcoatPbrExtension();
    Reflect.set(invalidUv, 'clearcoatRoughnessMapUvSet', 3);
    expect(isValidClearcoatPbrExtension(invalidUv)).toBe(false);
  });
});
