import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createIridescencePbrExtension,
  initializeIridescencePbrExtension,
  isValidIridescencePbrExtension,
} from './iridescencePbrExtension';

describe('createIridescencePbrExtension', () => {
  it('creates an Entity with glTF thickness defaults and independent UV sets', () => {
    const value = createIridescencePbrExtension({ iridescenceThicknessMapUvSet: 1 });
    expect(EntityRuntimeKey in value).toBe(true);
    expect(value.iridescenceIor).toBe(1.3);
    expect(value.iridescenceThicknessMin).toBe(100);
    expect(value.iridescenceThicknessMax).toBe(400);
    expect(value.iridescenceThicknessMapUvSet).toBe(1);
  });
});

describe('initializeIridescencePbrExtension', () => {
  it('is the construction initializer of createIridescencePbrExtension', () => {
    expect(typeof initializeIridescencePbrExtension).toBe('function');
  });
});
describe('isValidIridescencePbrExtension', () => {
  it('rejects invalid strength, IOR, thickness ordering, and UV selection', () => {
    expect(isValidIridescencePbrExtension(createIridescencePbrExtension())).toBe(true);
    expect(isValidIridescencePbrExtension(createIridescencePbrExtension({ iridescence: -1 }))).toBe(false);
    expect(isValidIridescencePbrExtension(createIridescencePbrExtension({ iridescenceIor: 0.5 }))).toBe(false);
    expect(
      isValidIridescencePbrExtension(
        createIridescencePbrExtension({ iridescenceThicknessMax: 100, iridescenceThicknessMin: 200 }),
      ),
    ).toBe(false);
    const invalidUv = createIridescencePbrExtension();
    Reflect.set(invalidUv, 'iridescenceMapUvSet', 2);
    expect(isValidIridescencePbrExtension(invalidUv)).toBe(false);
  });
});
