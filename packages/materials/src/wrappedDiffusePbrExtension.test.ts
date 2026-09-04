import { EntityRuntimeKey, WrappedDiffusePbrExtensionKind } from '@flighthq/types/contract';

import {
  createWrappedDiffusePbrExtension,
  initializeWrappedDiffusePbrExtension,
  isValidWrappedDiffusePbrExtension,
} from './wrappedDiffusePbrExtension';

describe('createWrappedDiffusePbrExtension', () => {
  it('names the approximation honestly and creates an Entity with independent UV sets', () => {
    const value = createWrappedDiffusePbrExtension({ thicknessMapUvSet: 1 });
    expect(EntityRuntimeKey in value).toBe(true);
    expect(value.kind).toBe(WrappedDiffusePbrExtensionKind);
    expect(value.wrappedDiffuseStrength).toBe(0);
    expect(value.thicknessMapUvSet).toBe(1);
    expect(value.wrappedDiffuseMapUvSet).toBe(0);
  });
});

describe('initializeWrappedDiffusePbrExtension', () => {
  it('is the construction initializer of createWrappedDiffusePbrExtension', () => {
    expect(typeof initializeWrappedDiffusePbrExtension).toBe('function');
  });
});
describe('isValidWrappedDiffusePbrExtension', () => {
  it('rejects invalid strength, thickness, and UV selection', () => {
    expect(isValidWrappedDiffusePbrExtension(createWrappedDiffusePbrExtension())).toBe(true);
    expect(isValidWrappedDiffusePbrExtension(createWrappedDiffusePbrExtension({ wrappedDiffuseStrength: 2 }))).toBe(
      false,
    );
    expect(isValidWrappedDiffusePbrExtension(createWrappedDiffusePbrExtension({ thickness: Infinity }))).toBe(false);
    const invalidUv = createWrappedDiffusePbrExtension();
    Reflect.set(invalidUv, 'wrappedDiffuseMapUvSet', 2);
    expect(isValidWrappedDiffusePbrExtension(invalidUv)).toBe(false);
  });
});
