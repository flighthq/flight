import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createSpecularPbrExtension,
  initializeSpecularPbrExtension,
  isValidSpecularPbrExtension,
} from './specularPbrExtension';

describe('createSpecularPbrExtension', () => {
  it('creates an Entity with independent strength and color UV sets', () => {
    const value = createSpecularPbrExtension({ specularColorMapUvSet: 1 });
    expect(EntityRuntimeKey in value).toBe(true);
    expect(value.specular).toBe(1);
    expect(value.specularMapUvSet).toBe(0);
    expect(value.specularColorMapUvSet).toBe(1);
  });
});

describe('initializeSpecularPbrExtension', () => {
  it('is the construction initializer of createSpecularPbrExtension', () => {
    expect(typeof initializeSpecularPbrExtension).toBe('function');
  });
});
describe('isValidSpecularPbrExtension', () => {
  it('rejects invalid strength and UV selection', () => {
    expect(isValidSpecularPbrExtension(createSpecularPbrExtension())).toBe(true);
    expect(isValidSpecularPbrExtension(createSpecularPbrExtension({ specular: -1 }))).toBe(false);
    const invalidUv = createSpecularPbrExtension();
    Reflect.set(invalidUv, 'specularMapUvSet', 2);
    expect(isValidSpecularPbrExtension(invalidUv)).toBe(false);
  });
});
