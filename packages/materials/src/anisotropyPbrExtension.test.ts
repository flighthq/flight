import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createAnisotropyPbrExtension,
  initializeAnisotropyPbrExtension,
  isValidAnisotropyPbrExtension,
} from './anisotropyPbrExtension';

describe('createAnisotropyPbrExtension', () => {
  it('creates an Entity with canonical defaults and per-map UV selection', () => {
    const value = createAnisotropyPbrExtension({ anisotropyMapUvSet: 1 });
    expect(EntityRuntimeKey in value).toBe(true);
    expect(value.anisotropyStrength).toBe(0);
    expect(value.anisotropyMapUvSet).toBe(1);
  });
});

describe('initializeAnisotropyPbrExtension', () => {
  it('is the construction initializer of createAnisotropyPbrExtension', () => {
    expect(typeof initializeAnisotropyPbrExtension).toBe('function');
  });
});
describe('isValidAnisotropyPbrExtension', () => {
  it('rejects invalid strength, rotation, and UV selection', () => {
    expect(isValidAnisotropyPbrExtension(createAnisotropyPbrExtension())).toBe(true);
    expect(isValidAnisotropyPbrExtension(createAnisotropyPbrExtension({ anisotropyStrength: 2 }))).toBe(false);
    expect(isValidAnisotropyPbrExtension(createAnisotropyPbrExtension({ anisotropyRotation: Infinity }))).toBe(false);
    const invalidUv = createAnisotropyPbrExtension();
    Reflect.set(invalidUv, 'anisotropyMapUvSet', 2);
    expect(isValidAnisotropyPbrExtension(invalidUv)).toBe(false);
  });
});
